// TODO: flesh out
export interface FailureDescriptor {
    // could represent "code" errors i.e. failed to connect to page,
    // or actual problems with the site. should have appropriate fields to describe precisely the failure.
    // todo: severity etc.
    description: string
}
