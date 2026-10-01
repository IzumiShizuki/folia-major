let active = false;

export const isEmbeddedWorkspaceRuntimeActive = (): boolean => active;

export const setEmbeddedWorkspaceRuntimeActive = (nextActive: boolean): void => {
  active = nextActive;
};
