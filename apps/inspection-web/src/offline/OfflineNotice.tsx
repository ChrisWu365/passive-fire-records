/**
 * Tells the user that something is waiting for a connection. It is information, not an error: nothing is
 * wrong that the user can fix, and the page carries on by itself once the connection returns.
 */
export function OfflineNotice({ message }: { message: string }) {
  return <div className="alert offline" role="status">{message}</div>;
}
