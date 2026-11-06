There's an issue, the rig job skill is auto-enforcing any codex to  try to identify its own identify when the rig job tema is not buing used, we need to improve taht to avoid trying to get it's identity when it's out of the rig team.

THis is hte error the agent told:
```
 The development-team skill says to run rig whoami, and I applied that step without checking whether this was a rig session. I’ll keep this work in the current checkout and record the correction.
```
which i can imaging that's because we have already ran the rig team inside that project (job-radar), as it adds the agent instrcution
