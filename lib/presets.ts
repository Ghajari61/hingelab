/** A named starting point: settings laid over the product defaults. */
export interface Preset<P> {
  id: string;
  name: string;
  note: string;
  params: Partial<P>;
}
