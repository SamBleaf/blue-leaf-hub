/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSupabase, supabaseConfigured } from "./supabaseClient.js";

const ProjectContext = createContext(null);

function readStored() {
  try {
    const raw = localStorage.getItem("blhub_active_project");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(project) {
  try {
    if (project) localStorage.setItem("blhub_active_project", JSON.stringify(project));
    else localStorage.removeItem("blhub_active_project");
  } catch { /* non-fatal */ }
}

export function ProjectProvider({ children }) {
  const [project, setProject] = useState(readStored);
  const [allProjects, setAllProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const validated = useRef(false);

  // Fetch all projects once on mount
  useEffect(() => {
    if (!supabaseConfigured) { setLoadingProjects(false); return; }
    const sb = getSupabase();
    sb.from("projects")
      .select("id, address, status, job_id")
      .not("status", "eq", "archived")
      .order("address")
      .then(({ data }) => {
        if (data) setAllProjects(data);
        setLoadingProjects(false);
      })
      .catch(() => setLoadingProjects(false));
  }, []);

  // Re-validate stored project still exists once allProjects loads
  useEffect(() => {
    if (loadingProjects || validated.current) return;
    validated.current = true;
    if (!project) return;
    const still = allProjects.find((p) => p.id === project.id);
    if (!still) {
      setProject(null);
      writeStored(null);
    } else if (still.address !== project.address || still.job_id !== project.job_id) {
      // Refresh stale fields
      const fresh = { ...project, address: still.address, job_id: still.job_id, status: still.status };
      setProject(fresh);
      writeStored(fresh);
    }
  }, [loadingProjects, allProjects, project]);

  const selectProject = useCallback((p) => {
    const stored = { id: p.id, address: p.address, status: p.status ?? null, job_id: p.job_id ?? null };
    setProject(stored);
    writeStored(stored);
  }, []);

  const clearProject = useCallback(() => {
    setProject(null);
    writeStored(null);
  }, []);

  return (
    <ProjectContext.Provider value={{ project, selectProject, clearProject, allProjects, loadingProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used inside <ProjectProvider>");
  return ctx;
}
