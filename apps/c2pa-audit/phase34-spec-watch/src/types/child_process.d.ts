declare module 'child_process' {
  import { ChildProcess } from 'child_process';
  
  interface SpawnOptions {
    stdio?: any;
    timeout?: number;
  }
  
  function spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
}
