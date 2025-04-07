// Just so that we can teardown corresponding conn if needed
export interface SocketMetadata {
    runId: string | null,
    // If true, this is an active (handshake completed) tunnel socket
    isActiveTunnelSocket: boolean
    // Active tunnel sockets are assigned a tunnel ID
    tunnelSocketId: string | null
    //runMetadata: Record<string, any>
}