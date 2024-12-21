declare namespace chrome {
  export namespace sidePanel {
    interface SetPanelBehaviorOptions {
      openPanelOnActionClick: boolean;
    }

    function setPanelBehavior(options: SetPanelBehaviorOptions): Promise<void>;
  }
}
