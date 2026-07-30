interface GameVideoMountHandle {
    unmount(): void;
}
declare function mount(rootEl: HTMLElement): GameVideoMountHandle;

export { type GameVideoMountHandle, mount };
