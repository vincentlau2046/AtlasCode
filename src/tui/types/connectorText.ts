export interface ConnectorTextBlock { type: 'connector_text'; text: string; }
export function isConnectorTextBlock(b: unknown): b is ConnectorTextBlock { return false; }
export type ConnectorTextDelta = any;
