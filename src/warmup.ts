export type WarmupSteps={compile:()=>Promise<void>;draw:()=>void;fence:()=>Promise<void>;restore:()=>void};

/** Never expose a warmup pose, including on failed compilation or context loss. */
export async function prepareGpu(steps:WarmupSteps):Promise<void> {
  try {await steps.compile();steps.draw();await steps.fence();}
  finally {steps.restore();}
}

export async function waitForGpu(gl:WebGL2RenderingContext):Promise<void> {
  if(gl.isContextLost())throw new Error('Graphics context lost during preparation.');
  const sync=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
  gl.flush();
  if(!sync){gl.finish();if(gl.isContextLost())throw new Error('Graphics context lost during preparation.');return;}
  try {
    await new Promise<void>((resolve,reject)=>{
      const check=()=>{
        if(gl.isContextLost()){reject(new Error('Graphics context lost during preparation.'));return;}
        const state=gl.clientWaitSync(sync,0,0);
        if(state===gl.ALREADY_SIGNALED||state===gl.CONDITION_SATISFIED)resolve();
        else if(state===gl.WAIT_FAILED)reject(new Error('Graphics preparation did not complete.'));
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  } finally {gl.deleteSync(sync);}
}
