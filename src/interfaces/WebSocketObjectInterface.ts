export interface WebSocketObjectInterface<T> {
    importFromBuffer(input: Buffer): T;
    exportToBuffer(): Buffer;
}
