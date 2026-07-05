export interface Session {
  email: string;
}

export interface Context {
  session: Session | null;
}
