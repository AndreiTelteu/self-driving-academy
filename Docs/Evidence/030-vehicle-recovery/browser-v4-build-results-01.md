# PBI030 V4 build-only results

ONE reviewed build and strict CURRENT build verification both exited 0. No native world, server, browser input or hardware capture was started. CPU released after terminal session 84303.

Checkout: `F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01`, branch `loop-pbi/vehicle-recovery-01`, HEAD `ad32db9c609cce1132669c95312ae202a62b87ed`.

Commands, exact UTC times, stdout/stderr and exits are retained in [browser-build-checks-04](browser-build-checks-04/complete.json). Build ran 2026-10-07T10:47:24.6296025Z–10:49:02.9054645Z; strict CURRENT verifier ran 10:49:02.9196542Z–10:49:03.9348314Z. No first failure or retry occurred.

[Actual manifest](browser-after-04/build-manifest.json), revision `030-functional-boundary-lifecycle-v4`, UUID `8644a197-d82f-4244-ae01-3c2de92320f3`:

- Source SHA256 `f03eb1a0f5247cfbf44906a3d7f96bbf815ecc57b5e84b8034395fa3b89ebd46`: 452 inputs, 3,477,246 bytes.
- Artifact SHA256 `d3ecfa58e31ed1273730b175fdf16f85141c36503c444bd1cd16833a3e561770`: 56 artifacts, 9,186,202 bytes.
- Actual native SHA256 `02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0`: 4,340,292 bytes.
- Whole ZIP SHA256 `80477e585924fb56da2c5218ab0c31426e3546ba1761d14159d3d755fdcf4f64`: 5,856,404 bytes, independently counted 511 entries.

Manifest chronology: started 10:47:24.942Z; source archived 10:48:56.101Z before Vite output; final archive 10:49:02.831Z. Strict verification includes current/archive/ZIP/native bytes and pinned successful native AFTER4 production equality. Original 438 current/archive input rows and all 39 original V1/V2/V3 raw files matched before and after. All original failed attempts remain failed.

[Bounded summary](browser-build-checks-04/actual-summary.json) records actual counts and scope. Browser functional/trusted-R and both-backend performance acceptance remain unexecuted for V4.

Next reviewed serving proposal, **not executed**:

```text
node --import ./scripts/register-typescript.mjs tests/browser/vehicle-recovery-after-v4/browser-server.mjs Docs/Evidence/030-vehicle-recovery/browser-after-04/build-manifest.json
```

Fixed assigned URL: `http://127.0.0.1:5222`. Root owns server authorization, browser actions and human guide handoff.
