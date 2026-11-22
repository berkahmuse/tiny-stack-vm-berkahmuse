// tiny-stack-vm — a threaded-code interpreter for make.fun's tiny stack ISA v1.
// Design: one decode pass turns program.bin into per-offset tables (opcode,
// immediate argument, stack pops/pushes); the run loop then dispatches on the
// tables instead of re-reading opcodes. Every hard rule in ISA.md is honoured:
// exact 32-bit MUL (Math.imul), DIV/MOD edges (-2^31/-1, x%-1), unsigned
// DIVU/MODU/LTU, 5-bit shift counts, PUSH8 sign extension, all ten trap codes,
// the 1,000,000-step and 65,536-output limits, falling off the end, IN past EOF.
// SPDX-License-Identifier: MIT
import {mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

// opcode byte -> [immediate bytes, pops, pushes]; absent = unknown opcode.
const T:{[k:number]:[number,number,number]}={
  0x00:[0,0,0],0x01:[1,0,1],0x02:[4,0,1],0x03:[0,1,0],0x04:[0,1,2],
  0x05:[0,2,2],0x06:[0,2,3],0x07:[0,3,3],0x10:[0,2,1],0x11:[0,2,1],
  0x12:[0,2,1],0x13:[0,2,1],0x14:[0,2,1],0x15:[0,2,1],0x16:[0,2,1],
  0x17:[0,1,1],0x18:[0,2,1],0x19:[0,2,1],0x1a:[0,2,1],0x1b:[0,1,1],
  0x1c:[0,2,1],0x1d:[0,2,1],0x1e:[0,2,1],0x20:[0,2,1],0x21:[0,2,1],
  0x22:[0,2,1],0x30:[2,0,0],0x31:[2,1,0],0x32:[2,1,0],0x33:[2,0,0],
  0x34:[0,0,0],0x40:[0,1,1],0x41:[0,2,0],0x50:[0,1,0],0x51:[0,1,0],
  0x52:[0,0,1],0x53:[0,1,0]};

function run(p:Uint8Array,inp:Uint8Array):{o:Uint8Array;c:number}{
  const n=p.length,op=new Int16Array(n),ar=new Int32Array(n),
    ln=new Uint8Array(n),pp=new Uint8Array(n),qq=new Uint8Array(n);
  for(let i=0;i<n;i++){ // decode pass: every byte offset, so jumps into the
    const d=T[p[i]];    // middle of an immediate decode as opcodes, as the ISA says.
    if(!d){op[i]=-1;continue}
    const L=d[0];ln[i]=L;pp[i]=d[1];qq[i]=d[2];op[i]=p[i];
    if(i+L<n){
      const b=p[i];
      if(b===0x01)ar[i]=(p[i+1]<<24)>>24;
      else if(b===0x02)ar[i]=p[i+1]|p[i+2]<<8|p[i+3]<<16|p[i+4]<<24;
      else if(b===0x30||b===0x31||b===0x32)ar[i]=((p[i+1]|p[i+2]<<8)<<16)>>16;
      else if(b===0x33)ar[i]=p[i+1]|p[i+2]<<8;
    }
  }
  const D=new Int32Array(256);let sp=0;
  const C=new Int32Array(64);let cp=0;
  const M=new Int32Array(256);
  const out=new Uint8Array(65536);let ol=0,ip=0,pc=0,s=0;
  const end=(c:number)=>({o:out.slice(0,ol),c});
  for(;;){
    if(s===1e6)return end(10);
    if(pc<0||pc>=n)return end(9);
    const b=op[pc];
    if(b<0)return end(5);
    if(pc+ln[pc]>=n)return end(9);
    s++;
    if(sp<pp[pc])return end(2);
    if(sp-pp[pc]+qq[pc]>256)return end(3);
    const a=ar[pc];pc+=1+ln[pc];
    switch(b){
      case 0x00:return end(0);
      case 0x01:case 0x02:D[sp++]=a;break;
      case 0x03:sp--;break;
      case 0x04:D[sp]=D[sp-1];sp++;break;
      case 0x05:{const t=D[sp-1];D[sp-1]=D[sp-2];D[sp-2]=t;break}
      case 0x06:D[sp]=D[sp-2];sp++;break;
      case 0x07:{const t=D[sp-3];D[sp-3]=D[sp-2];D[sp-2]=D[sp-1];D[sp-1]=t;break}
      case 0x17:D[sp-1]=-D[sp-1]|0;break;
      case 0x1b:D[sp-1]=~D[sp-1];break;
      case 0x10:case 0x11:case 0x12:case 0x13:case 0x14:case 0x15:case 0x16:
      case 0x18:case 0x19:case 0x1a:case 0x1c:case 0x1d:case 0x1e:
      case 0x20:case 0x21:case 0x22:{
        const y=D[sp-1],x=D[sp-2];let r=0;
        if(b===0x10)r=(x+y)|0;
        else if(b===0x11)r=(x-y)|0;
        else if(b===0x12)r=Math.imul(x,y);
        else if(b===0x13){if(!y)return end(4);r=x===-2147483648&&y===-1?x:(x/y)|0}
        else if(b===0x14){if(!y)return end(4);r=y===-1?0:x%y|0}
        else if(b===0x15){if(!y)return end(4);r=Math.floor((x>>>0)/(y>>>0))|0}
        else if(b===0x16){if(!y)return end(4);r=(x>>>0)%(y>>>0)|0}
        else if(b===0x18)r=x&y;
        else if(b===0x19)r=x|y;
        else if(b===0x1a)r=x^y;
        else if(b===0x1c)r=x<<(y&31);
        else if(b===0x1d)r=x>>(y&31);
        else if(b===0x1e)r=(x>>>(y&31))|0;
        else if(b===0x20)r=x===y?1:0;
        else if(b===0x21)r=x<y?1:0;
        else r=(x>>>0)<(y>>>0)?1:0;
        D[sp-2]=r;sp--;break}
      case 0x30:pc+=a;break;
      case 0x31:case 0x32:{const v=D[--sp];if((b===0x31)===(v===0))pc+=a;break}
      case 0x33:if(cp===64)return end(7);C[cp++]=pc;pc=a;break;
      case 0x34:if(cp===0)return end(8);pc=C[--cp];break;
      case 0x40:{const ad=D[sp-1];if(ad<0||ad>255)return end(6);D[sp-1]=M[ad];break}
      case 0x41:{const ad=D[sp-1],v=D[sp-2];if(ad<0||ad>255)return end(6);sp-=2;M[ad]=v;break}
      case 0x50:{const t=String(D[sp-1]);if(ol+t.length>65536)return end(11);sp--;
        for(let k=0;k<t.length;k++)out[ol++]=t.charCodeAt(k);break}
      case 0x51:if(ol+1>65536)return end(11);out[ol++]=D[--sp]&255;break;
      case 0x52:D[sp++]=ip<inp.length?inp[ip++]:-1;break;
      case 0x53:return end(D[--sp]&255);
    }
  }
}

const I=process.env.MAKEFUN_INPUT_DIR??'/input';
const O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
for(const id of readdirSync(I).sort()){
  const r=run(new Uint8Array(readFileSync(join(I,id,'program.bin'))),
    new Uint8Array(readFileSync(join(I,id,'input.bin'))));
  mkdirSync(join(O,id),{recursive:true});
  writeFileSync(join(O,id,'stdout.bin'),r.o);
  writeFileSync(join(O,id,'exit.txt'),r.c+'\n');
}
