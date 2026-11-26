import type { Area, FirestopSystem, Project, SystemSnapshot } from '../api/types';

export interface PickerOption {
  value: string;
  label: string;
}

const INACTIVE_SUFFIX = ' (inactive)';

export function projectLabel(project: Pick<Project, 'code' | 'name'>): string {
  return `${project.code} — ${project.name}`;
}

export function systemLabel(system: Pick<SystemSnapshot, 'code' | 'substrate' | 'serviceType'>): string {
  return `${system.code} — ${system.substrate}, ${system.serviceType}`;
}

/**
 * The projects a record may be given: the active ones. A record that already refers to a project that is
 * no longer offered (deactivated, or the register has not answered) keeps that project as an extra option,
 * so opening the record never silently changes what it refers to.
 *
 * @param storedName the project name kept on the record, used when the register does not know the project
 */
export function projectOptions(projects: Project[], selectedId: string, storedName: string | undefined): PickerOption[] {
  const options = projects.filter((project) => project.active)
    .map((project) => ({ value: project.id, label: projectLabel(project) }));
  if (!selectedId || options.some((option) => option.value === selectedId)) return options;
  const known = projects.find((project) => project.id === selectedId);
  if (known) return [{ value: selectedId, label: projectLabel(known) + INACTIVE_SUFFIX }, ...options];
  return storedName ? [{ value: selectedId, label: storedName }, ...options] : options;
}

/**
 * The systems a record may be given: the project's active ones, plus the record's current system when it
 * is no longer offered, for the same reason as in projectOptions.
 *
 * @param stored the system copy kept on the record, used when the register does not know the system
 */
export function systemOptions(
  systems: FirestopSystem[],
  selectedId: string,
  stored: SystemSnapshot | undefined
): PickerOption[] {
  const options = systems.filter((system) => system.active)
    .map((system) => ({ value: system.id, label: systemLabel(system) }));
  if (!selectedId || options.some((option) => option.value === selectedId)) return options;
  const known = systems.find((system) => system.id === selectedId);
  if (known) return [{ value: selectedId, label: systemLabel(known) + INACTIVE_SUFFIX }, ...options];
  return stored ? [{ value: selectedId, label: systemLabel(stored) }, ...options] : options;
}

/**
 * The areas a record may be given: the project's active ones, plus the record's current area when it is
 * no longer offered, for the same reason as in projectOptions.
 *
 * @param storedName the area name kept on the record, used when the register does not know the area
 */
export function areaOptions(areas: Area[], selectedId: string, storedName: string | undefined): PickerOption[] {
  const options = areas.filter((area) => area.active).map((area) => ({ value: area.id, label: area.name }));
  if (!selectedId || options.some((option) => option.value === selectedId)) return options;
  const known = areas.find((area) => area.id === selectedId);
  if (known) return [{ value: selectedId, label: known.name + INACTIVE_SUFFIX }, ...options];
  return storedName ? [{ value: selectedId, label: storedName }, ...options] : options;
}
