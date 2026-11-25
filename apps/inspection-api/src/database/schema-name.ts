const VALID_SCHEMA_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Thrown when a configured schema name could not be used safely as an SQL identifier.
 */
export class InvalidSchemaNameError extends Error {
  constructor(schema: string) {
    super(
      `Invalid database schema name ${JSON.stringify(schema)}: `
      + 'use lower-case letters, digits and underscores, starting with a letter or underscore.'
    );
    this.name = 'InvalidSchemaNameError';
  }
}

/**
 * Schema names are placed directly into SQL text, because identifiers cannot be bound as parameters.
 * This check is what makes that safe, so every place that builds SQL with a schema name calls it first.
 *
 * @returns the same name, once it is known to be a plain identifier
 * @throws InvalidSchemaNameError otherwise
 */
export function assertValidSchemaName(schema: string): string {
  if (!VALID_SCHEMA_NAME.test(schema)) throw new InvalidSchemaNameError(schema);
  return schema;
}
