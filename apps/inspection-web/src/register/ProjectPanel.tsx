import { useState } from 'react';
import type { Project } from '../api/types';

interface ProjectPanelProps {
  projects: Project[];
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  /** Called when the user asks to add a project. */
  onNew: () => void;
}

const NO_PROJECTS = 'No projects yet.';
const NO_MATCH = 'No projects match.';

function matches(project: Project, query: string): boolean {
  return `${project.code} ${project.name}`.toLowerCase().includes(query);
}

/**
 * The list of projects, with a search box and the button that adds one. Inactive projects are listed only
 * while "Show inactive" is ticked, except the selected project, which never disappears from under the user.
 */
export function ProjectPanel({ projects, selectedId, onSelect, onNew }: ProjectPanelProps) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const query = search.trim().toLowerCase();
  const visible = projects.filter((project) =>
    (showInactive || project.active || project.id === selectedId) && matches(project, query));

  return (
    <section className="panel register-panel">
      <div className="panel-heading register-heading">
        <h3>Projects</h3>
        <button type="button" className="button primary" onClick={onNew}>New project</button>
      </div>
      <div className="list-tools">
        <input
          type="search"
          aria-label="Search projects"
          placeholder="Search by code or name"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
          Show inactive
        </label>
      </div>
      {visible.length === 0 && <p className="muted register-empty">{projects.length === 0 ? NO_PROJECTS : NO_MATCH}</p>}
      <ul className="project-list" aria-label="Projects">
        {visible.map((project) => (
          <li key={project.id}>
            <button
              type="button"
              className={`project-item ${project.id === selectedId ? 'selected' : ''}`}
              aria-pressed={project.id === selectedId}
              onClick={() => onSelect(project.id)}
            >
              <strong>{project.code}</strong> <span>{project.name}</span>
              {!project.active && <> <span className="badge inactive">Inactive</span></>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
