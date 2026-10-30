import { NOW, incidents, type Incident } from "../data/mockDb.ts";
import { BusinessError } from "./errors.ts";

const TEAMS = ["THANH_TOAN", "KHO_VAN", "KY_THUAT", "CSKH"];

// GHI: tao su co giao cho doi xu ly
export function createIncident(input: Omit<Incident, "incidentId" | "createdAt">) {
  if (!input.title?.trim()) throw new BusinessError("Sự cố cần có tiêu đề.");
  if (!TEAMS.includes(input.team)) throw new BusinessError(`Đội xử lý phải là một trong: ${TEAMS.join(", ")}.`);
  const incident: Incident = {
    ...input,
    title: input.title.trim(),
    incidentId: `INC-${String(incidents.length + 1).padStart(3, "0")}`,
    createdAt: NOW,
  };
  incidents.push(incident);
  return incident;
}
