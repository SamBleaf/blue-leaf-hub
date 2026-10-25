// =============================================================================
// fixContext.js — HUB 029: the fix rows for the card on screen and how to open one. TakeoffApp provides
// { materialId, rows (shared/takeoff/fixes.js fixesFor), open(row), reviewOrder?() }; with no provider (the company
// catalogue editor) the cards read as before.
// =============================================================================
import { createContext } from "react";

export const FixContext = createContext(null);
