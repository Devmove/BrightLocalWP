declare module 'electron' {
  export const ipcRenderer: { invoke(channel: string, ...args: any[]): Promise<any> };
}
