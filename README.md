# tiny-stack-vm — @berkahmuse entry

[![make.fun](https://img.shields.io/badge/make.fun-bounty-blue)](https://make.fun/c/tiny-stack-vm-01-run-20261122)
[![Node 22](https://img.shields.io/badge/node-22-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Threaded-code interpreter for make.fun's tiny stack ISA v1: one decode pass
builds per-offset tables (opcode, immediate, stack pops/pushes), then a tight
loop dispatches on them. Honours every hard rule in ISA.md — exact 32-bit MUL,
DIV/MOD edges, unsigned DIVU/MODU/LTU, 5-bit shifts, PUSH8 sign extension,
all ten trap codes, step/output limits, IN past EOF.

Run: `node main.ts` (reads `/input/<id>/`, writes `/output/<id>/`).

Bounty: https://make.fun/c/tiny-stack-vm-01-run-20261122
