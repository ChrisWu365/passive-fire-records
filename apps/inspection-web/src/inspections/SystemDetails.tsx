import type { SystemSnapshot } from '../api/types';

/**
 * The chosen firestop system's details. Always read-only: the installer picks a system, and its details
 * come from the register (or, for a stored record, from the copy the record keeps).
 */
export function SystemDetails({ system }: { system: SystemSnapshot }) {
  return (
    <div className="system-details" role="group" aria-label="System details">
      <dl>
        <Detail term="Substrate" value={system.substrate} />
        <Detail term="Service type" value={system.serviceType} />
        <Detail term="Fire rating" value={system.fireRating} />
        <Detail term="Materials" value={system.materials} />
        <Detail term="Installation method" value={system.installationMethod} />
      </dl>
    </div>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return <div><dt>{term}</dt><dd>{value}</dd></div>;
}
