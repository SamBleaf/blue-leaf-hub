import crypto from "crypto";
import { getServiceSupabase } from "./supabaseService.mjs";
import { sendPlainMail } from "./notifyMail.mjs";
import { appBaseUrl } from "./appUrl.mjs";

const ROLES = ["admin", "supervisor", "employee", "client"];

async function getCallerProfile(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await sb
    .from("user_profiles")
    .select("id, role, is_active, full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;
  return { ...profile, authId: user.id };
}

function isValidEmail(email) {
  const e = String(email || "").trim();
  return e.includes("@") && e.includes(".");
}

/**
 * @param {import("express").Express} app
 */
export function registerAuthRoutes(app) {
  app.post("/api/auth/bootstrap-admin", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const { count } = await sb
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count || 0) > 0) {
        return res.status(409).json({ error: "An admin account already exists. Bootstrap is disabled." });
      }

      const secret = process.env.BOOTSTRAP_SECRET?.trim();
      if (!secret) return res.status(503).json({ error: "BOOTSTRAP_SECRET not set in server env." });

      const { email, password, fullName, bootstrapSecret } = req.body || {};
      if (bootstrapSecret !== secret) return res.status(403).json({ error: "Invalid bootstrap secret." });
      if (!email || !password || !fullName) {
        return res.status(400).json({ error: "email, password, fullName required." });
      }
      if (String(password).length < 8) return res.status(400).json({ error: "Password min 8 characters." });

      const { data: { user }, error: createErr } = await sb.auth.admin.createUser({
        email: String(email).trim(),
        password,
        email_confirm: true,
        user_metadata: { full_name: String(fullName).trim() }
      });
      if (createErr) return res.status(500).json({ error: createErr.message });

      const { error: profileErr } = await sb.from("user_profiles").insert({
        id: user.id,
        email: String(email).trim(),
        full_name: String(fullName).trim(),
        role: "admin",
        is_active: true
      });
      if (profileErr) return res.status(500).json({ error: profileErr.message });

      return res.json({ ok: true, message: "Admin account created. You can now log in." });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Bootstrap failed." });
    }
  });

  app.post("/api/auth/invite", async (req, res) => {
    try {
      const caller = await getCallerProfile(req);
      if (!caller) return res.status(401).json({ error: "Unauthorised" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const { email, fullName, role, projectId, employeeId } = req.body || {};
      if (!isValidEmail(email)) return res.status(400).json({ error: "Valid email required." });
      if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role." });

      const emailNorm = String(email).trim().toLowerCase();

      // Optional: link this login to an in-house employee (canonical employee<->login link).
      if (employeeId) {
        const { data: emp } = await sb.from("employees").select("id, user_id, is_active").eq("id", employeeId).maybeSingle();
        if (!emp) return res.status(404).json({ error: "Employee not found." });
        if (emp.is_active === false) return res.status(400).json({ error: "This employee is inactive." });
        if (emp.user_id) return res.status(409).json({ error: "This employee already has a login." });
        const { data: linkedProfile } = await sb.from("user_profiles").select("id").eq("employee_id", employeeId).maybeSingle();
        if (linkedProfile) return res.status(409).json({ error: "This employee already has a login." });
      }

      const { data: existingUser } = await sb
        .from("user_profiles")
        .select("id")
        .eq("email", emailNorm)
        .maybeSingle();
      if (existingUser) {
        return res.status(409).json({ error: "A user with this email already exists." });
      }

      const now = new Date().toISOString();
      const { data: pending } = await sb
        .from("invitations")
        .select("id")
        .eq("email", emailNorm)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", now);

      for (const inv of pending || []) {
        await sb.from("invitations").update({ revoked_at: now }).eq("id", inv.id);
      }

      // Supersede any prior pending invite for the SAME employee (possibly a different email).
      if (employeeId) {
        const { data: empPending } = await sb.from("invitations").select("id")
          .eq("employee_id", employeeId).is("accepted_at", null).is("revoked_at", null).gt("expires_at", now);
        for (const inv of empPending || []) {
          await sb.from("invitations").update({ revoked_at: now }).eq("id", inv.id);
        }
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { error: insertErr } = await sb.from("invitations").insert({
        email: emailNorm,
        full_name: fullName || null,
        role,
        token,
        invited_by: caller.id,
        project_id: projectId || null,
        employee_id: employeeId || null,
        expires_at: expiresAt
      });
      if (insertErr) return res.status(500).json({ error: insertErr.message });

      // Stamp the employee as invited so the Team Directory shows "Last invited / Resend".
      if (employeeId) {
        await sb.from("employees").update({ invite_sent_at: now, updated_at: now }).eq("id", employeeId);
      }

      const inviteUrl = `${appBaseUrl()}/accept-invite/${token}`;
      const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

      const text = `Hi ${fullName || emailNorm},

You've been invited to join Blue Leaf Hub by ${caller.full_name || caller.email}.

Your role: ${roleLabel}

Click the link below to set up your account (expires in 7 days):

${inviteUrl}

If you weren't expecting this, you can ignore this email.

— Blue Leaf Building`;

      const html = `
<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;color:#1A1A2E;">
  <p>Hi ${fullName || emailNorm},</p>
  <p>You've been invited to join <strong>Blue Leaf Hub</strong> by ${caller.full_name || caller.email}.</p>
  <p>Your role: <strong>${roleLabel}</strong></p>
  <p style="margin:24px 0;">
    <a href="${inviteUrl}" style="display:inline-block;background:#006c9b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
      Set up your account
    </a>
  </p>
  <p style="font-size:12px;color:#64748B;">This link expires in 7 days.</p>
  <p style="font-size:12px;color:#64748B;">If you weren't expecting this, you can ignore this email.</p>
  <p>— Blue Leaf Building</p>
</div>`;

      try {
        await sendPlainMail({
          to: emailNorm,
          subject: "You've been invited to Blue Leaf Hub",
          text,
          html
        });
      } catch (mailErr) {
        return res.json({
          ok: true,
          inviteUrl,
          email: emailNorm,
          role,
          warning: mailErr.message || "Email send failed"
        });
      }

      return res.json({ ok: true, inviteUrl, email: emailNorm, role });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Invite failed." });
    }
  });

  async function validateInvitationToken(sb, token) {
    const { data: inv } = await sb
      .from("invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!inv) return { error: "Invitation not found or expired", status: 404 };
    if (inv.accepted_at) return { error: "This invitation has already been used", status: 410 };
    if (inv.revoked_at) return { error: "This invitation has been revoked", status: 410 };
    if (new Date(inv.expires_at) < new Date()) {
      return { error: "This invitation has expired", status: 410 };
    }
    return { invitation: inv };
  }

  app.get("/api/auth/invite/:token", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });
      const result = await validateInvitationToken(sb, req.params.token);
      if (result.error) return res.status(result.status).json({ error: result.error });
      const inv = result.invitation;
      return res.json({
        ok: true,
        email: inv.email,
        fullName: inv.full_name,
        role: inv.role,
        expiresAt: inv.expires_at
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Request failed." });
    }
  });

  app.post("/api/auth/accept-invite", async (req, res) => {
    try {
      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const { token, password, fullName } = req.body || {};
      if (!token) return res.status(400).json({ error: "token required" });
      if (!password || String(password).length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters." });
      }
      if (!fullName || String(fullName).trim().length < 2) {
        return res.status(400).json({ error: "Full name required (min 2 characters)." });
      }

      const result = await validateInvitationToken(sb, token);
      if (result.error) return res.status(result.status).json({ error: result.error });
      const inv = result.invitation;

      const { data: existingUser } = await sb
        .from("user_profiles")
        .select("id")
        .eq("email", inv.email)
        .maybeSingle();
      if (existingUser) {
        return res.status(409).json({ error: "An account with this email already exists. Try logging in." });
      }

      let user;
      const created = await sb.auth.admin.createUser({
        email: inv.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: String(fullName).trim() }
      });
      if (created.error) {
        // The auth user may already exist from an earlier invite attempt whose email
        // never arrived (e.g. the old Supabase-email path). Recover it: find by email
        // and set the password they just chose, rather than dead-ending here.
        const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const existing = (list?.users || []).find(
          (u) => (u.email || "").toLowerCase() === inv.email.toLowerCase()
        );
        if (!existing) return res.status(500).json({ error: created.error.message });
        const { data: upd, error: updErr } = await sb.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          user_metadata: { full_name: String(fullName).trim() }
        });
        if (updErr) return res.status(500).json({ error: updErr.message });
        user = upd.user;
      } else {
        user = created.data.user;
      }

      const profileRow = {
        id: user.id,
        email: inv.email,
        full_name: String(fullName).trim(),
        role: inv.role,
        is_active: true,
        invited_by: inv.invited_by
      };
      if (inv.employee_id) profileRow.employee_id = inv.employee_id;
      const { error: profileErr } = await sb.from("user_profiles").insert(profileRow);
      if (profileErr) {
        // One login per employee (partial-unique index) — plain message, never raw SQL.
        if (profileErr.code === "23505" || /employee_id/i.test(profileErr.message || "")) {
          return res.status(409).json({ error: "This employee already has a login." });
        }
        return res.status(500).json({ error: profileErr.message });
      }

      // Establish the canonical employee->login link eagerly so resolveWorkerEmployee matches on
      // employees.user_id. Guard against the employee already being linked to a DIFFERENT login.
      if (inv.employee_id) {
        const { data: linked } = await sb.from("employees")
          .update({ user_id: user.id, updated_at: new Date().toISOString() })
          .eq("id", inv.employee_id).is("user_id", null).select("id");
        if (!linked || linked.length === 0) {
          const { data: emp2 } = await sb.from("employees").select("user_id").eq("id", inv.employee_id).maybeSingle();
          if (emp2?.user_id !== user.id) {
            await sb.from("user_profiles").update({ employee_id: null }).eq("id", user.id);
            return res.status(409).json({ error: "This employee is already linked to another login." });
          }
        }
      }

      await sb
        .from("invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", inv.id);

      if (inv.project_id && inv.role === "client") {
        await sb
          .from("projects")
          .update({ portal_client_email: inv.email, portal_client_name: String(fullName).trim() })
          .eq("id", inv.project_id);

        // Portal v2: link this client account to the project. requirePortalAuth's
        // JWT path checks project_client_users(user_id, project_id) — without this
        // row the client would log in but get 403 on every portal route.
        // Tolerate the table not existing yet (migration 103 not applied) so the
        // existing token portal keeps working.
        try {
          await sb
            .from("project_client_users")
            .upsert(
              {
                project_id: inv.project_id,
                user_id: user.id,
                role: "primary",
                is_active: true,
                invited_at: inv.created_at || null,
                invite_accepted_at: new Date().toISOString()
              },
              { onConflict: "project_id,user_id" }
            );
        } catch (linkErr) {
          console.warn("[accept-invite] project_client_users link skipped:", linkErr?.message || linkErr);
        }
      }

      return res.json({ ok: true, email: inv.email });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Accept failed." });
    }
  });

  app.get("/api/auth/users", async (req, res) => {
    try {
      const caller = await getCallerProfile(req);
      if (!caller) return res.status(401).json({ error: "Unauthorised" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const { data, error } = await sb
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, users: data || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Request failed." });
    }
  });

  app.patch("/api/auth/users/:userId", async (req, res) => {
    try {
      const caller = await getCallerProfile(req);
      if (!caller) return res.status(401).json({ error: "Unauthorised" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const userId = req.params.userId;
      const { fullName, role, isActive } = req.body || {};

      if (userId === caller.id && isActive === false) {
        return res.status(400).json({ error: "You cannot deactivate your own account." });
      }

      const patch = { updated_at: new Date().toISOString() };
      if (fullName != null) patch.full_name = fullName;
      if (role != null) {
        if (!ROLES.includes(role)) return res.status(400).json({ error: "Invalid role." });
        patch.role = role;
      }
      if (isActive != null) patch.is_active = Boolean(isActive);

      const { data, error } = await sb
        .from("user_profiles")
        .update(patch)
        .eq("id", userId)
        .select()
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, user: data });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Update failed." });
    }
  });

  app.get("/api/auth/invitations", async (req, res) => {
    try {
      const caller = await getCallerProfile(req);
      if (!caller) return res.status(401).json({ error: "Unauthorised" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const { data, error } = await sb
        .from("invitations")
        .select("id, email, full_name, role, expires_at, created_at")
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, invitations: data || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Request failed." });
    }
  });

  app.delete("/api/auth/invitations/:invitationId", async (req, res) => {
    try {
      const caller = await getCallerProfile(req);
      if (!caller) return res.status(401).json({ error: "Unauthorised" });
      if (caller.role !== "admin") return res.status(403).json({ error: "Forbidden" });

      const sb = getServiceSupabase();
      if (!sb) return res.status(503).json({ error: "DB not configured" });

      const { error } = await sb
        .from("invitations")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", req.params.invitationId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || "Revoke failed." });
    }
  });
}
