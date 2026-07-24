const {
    INSTRUCTIONS: BASE
} = require("./asm_declarations.generated");

const EXTRA = [
    {
        name: "bctr",
        opCode: 0x4E800420,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Branch to CTR (bctr)",
        help: "Branches to the address held in the count register (CTR).",
        example: "bctr"
    },
    {
        name: "bctrl",
        opCode: 0x4E800421,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Branch to CTR and Link",
        help: "Branches to the address in CTR and sets the link register to the return address.",
        example: "bctrl",
    },
    {
        name: "trap",
        opCode: 0x7FE00008,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Trap (trap)",
        help: "Traps unconditionally. Same as tw 31, r0, r0.",
        example: "trap",
    },
    {
        name: "tw",
        opCode: 0x7C000008,
        type: "typeNAN",
        opShift: null,
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Trap Word",
        help: "Traps (raises a program exception) when the signed comparison of rA and rB matches the 5-bit TO condition.",
        example: "tw 12, r3, r4",
    },
    {
        name: "clrldi",
        opCode: 0x78000000,
        type: "typeIMM5",
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x01, 0x00, 0x02],
        title: "Clear Left Immediate (clrldi)",
        help: "Clrldi rA, rS, n",
        example: "clrldi r0, r0, 32",
    },
    {
        name: "xor",
        opCode: 0x7C000278,
        type: "typeNAN",
        opShift: [0x06, 0x09],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x01, 0x00, 0x02],
        title: "Exclusive OR (xor)",
        help: "Exclusive-ORs register rS with register rB, storing the result in register rA.",
        example: "xor r3, r4, r5"
    },
    {
        name: "xori",
        opCode: 0x68000000,
        type: "typeIMM", // same encoding as ori
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x10, 0x00], // 21,16,0
        order: [0x01, 0x00, 0x02], // rA, rD, IMM
        title: "Exclusive OR Immediate (xori)",
        help: "Exclusive-ORs register rS with IMM, storing the result in register rA.",
        example: "xori r3, r5, 0x1234"
    },
    {
        name: "xoris",
        opCode: 0x6C000000,
        type: "typeIMM",
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x10, 0x00],
        order: [0x01, 0x00, 0x02],
        title: "Exclusive OR Immediate Shifted (xoris)",
        help: "Exclusive-ORs register rS with IMM shifted left 16 bits, storing the result in register rA.",
        example: "xoris r3, r5, 0x1234"
    },
    {
        name: "ori",
        opCode: 0x60000000,
        type: "typeIMM",
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x10, 0x00],
        order: [0x01, 0x00, 0x02],
        title: "Logical OR Immediate (ori)",
        help: "ORs register rS with IMM, storing the result in register rA.",
        example: "ori r3, r5, 0x1300"
    },
    {
        name: "oris",
        opCode: 0x64000000,
        type: "typeIMM",
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x10, 0x00],
        order: [0x01, 0x00, 0x02],
        title: "Logical OR Immediate Shifted (oris)",
        help: "ORs register rS with IMM shifted left 16 bits, storing the result in register rA.",
        example: "oris r3, r5, 0x1300"
    },
    {
        name: "lwarx",
        opCode: 0x7C000028,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Load Word and Reserve Indexed (lwarx)",
        help: "Loads a word from rA + rB into register rD and sets a reservation for a following stwcx. (atomic sequence).",
        example: "lwarx r3, r4, r5"
    },
    {
        name: "stwcx.",
        opCode: 0x7C00012D,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Store Word Conditional Indexed (stwcx.)",
        help: "Conditionally stores register rS to rA + rB, succeeding only if the lwarx reservation still holds. Updates cr0.",
        example: "stwcx. r3, r4, r5"
    },
    {
        name: "sync",
        opCode: 0x7C0004AC,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Synchronize (sync)",
        help: "Waits for all prior memory accesses to complete (a full memory barrier).",
        example: "sync"
    },
    {
        name: "lwsync",
        opCode: 0x7C2004AC,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Lightweight Synchronize (lwsync)",
        help: "A lighter memory barrier that orders loads and stores without the full cost of sync.",
        example: "lwsync"
    },
    {
        name: "eieio",
        opCode: 0x7C0006AC,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Enforce In-Order Execution of I/O (eieio)",
        help: "Orders memory-mapped I/O accesses so they complete in program order.",
        example: "eieio"
    },
    {
        name: "isync",
        opCode: 0x4C00012C,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "Instruction Synchronize (isync)",
        help: "Discards prefetched instructions so following code sees prior context changes.",
        example: "isync"
    },
    {
        name: "icbi",
        opCode: 0x7C0007AC,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x10, 0x0B],
        order: [0x00, 0x01],
        title: "Instruction Cache Block Invalidate (icbi)",
        help: "Invalidates the instruction-cache block containing the address rA + rB.",
        example: "icbi r3, r4"
    },
    {
        name: "dcbz",
        opCode: 0x7C0007EC,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x10, 0x0B],
        order: [0x00, 0x01],
        title: "Data Cache Block Set to Zero (dcbz)",
        help: "Zeros the data-cache block containing the address rA + rB.",
        example: "dcbz r3, r4"
    },
    {
        name: "extsb",
        opCode: 0x7C000774,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10],
        order: [0x01, 0x00],
        title: "Extend Sign Byte (extsb)",
        help: "Sign-extends the low byte of register rS into register rA.",
        example: "extsb r3, r4"
    },
    {
        name: "extsh",
        opCode: 0x7C000734,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10],
        order: [0x01, 0x00],
        title: "Extend Sign Halfword (extsh)",
        help: "Sign-extends the low halfword of register rS into register rA.",
        example: "extsh r3, r4"
    },
    {
        name: "cntlzw",
        opCode: 0x7C000034,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10],
        order: [0x01, 0x00],
        title: "Count Leading Zeros Word (cntlzw)",
        help: "Counts the leading zero bits in register rS, storing the count (0 to 32) in register rA.",
        example: "cntlzw r3, r4"
    },
    {
        name: "lvx",
        opCode: 0x7C0000CE,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Load Vector Indexed (lvx)",
        help: "Loads 16 bytes from rA + rB into vector register vD.",
        example: "lvx v0, r3, r4"
    },
    {
        name: "stvx",
        opCode: 0x7C0001CE,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Store Vector Indexed (stvx)",
        help: "Stores 16 bytes from vector register vS to rA + rB.",
        example: "stvx v0, r3, r4"
    },
    {
        name: "lvxl",
        opCode: 0x7C0002CE,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Load Vector Indexed L-form (lvxl)",
        help: "Loads 16 bytes from rA + rB into vD, marking the cache line least-recently-used (L-form).",
        example: "lvxl v31, 0, r12"
    },
    {
        name: "stvxl",
        opCode: 0x7C0003CE,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Store Vector Indexed L-form (stvxl)",
        help: "Stores 16 bytes from vS to rA + rB, marking the cache line least-recently-used (L-form).",
        example: "stvxl v31, 0, r12"
    },
    {
        name: "stvebx",
        opCode: 0x7C00010E,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Store Vector Element Byte Indexed (stvebx)",
        help: "Stores one byte element from vector register vS to rA + rB.",
        example: "stvebx v0, r3, r4"
    },
    {
        name: "stvehx",
        opCode: 0x7C00014E,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Store Vector Element Halfword Indexed (stvehx)",
        help: "Stores one halfword element from vector register vS to rA + rB.",
        example: "stvehx v0, r3, r4"
    },
    {
        name: "stvewx",
        opCode: 0x7C00018E,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Store Vector Element Word Indexed (stvewx)",
        help: "Stores one word element from vector register vS to rA + rB.",
        example: "stvewx v0, r3, r4"
    },
    { name: "lvsl", opCode: 0x7C00000C, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Vector for Shift Left (lvsl)", help: "Builds a permute-control vector in vD for realigning unaligned loads at rA + rB.", example: "lvsl v0, r3, r4" },
    { name: "lvsr", opCode: 0x7C00004C, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Vector for Shift Right (lvsr)", help: "Builds a permute-control vector in vD for realigning unaligned loads at rA + rB.", example: "lvsr v0, r3, r4" },
    { name: "lvebx", opCode: 0x7C00000E, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Vector Element Byte Indexed (lvebx)", help: "Loads one byte element from rA + rB into vD.", example: "lvebx v0, r3, r4" },
    { name: "lvehx", opCode: 0x7C00004E, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Vector Element Halfword Indexed (lvehx)", help: "Loads one halfword element from rA + rB into vD.", example: "lvehx v0, r3, r4" },
    { name: "lvewx", opCode: 0x7C00008E, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Vector Element Word Indexed (lvewx)", help: "Loads one word element from rA + rB into vD.", example: "lvewx v0, r3, r4" },
    // the AltiVec compute instructions (opcode 4) are generated by altivecOps() below.
    {
        name: "extsw",
        opCode: 0x7C0007B4,
        type: "typeNAN",
        opShift: [0x06, 0x00],
        shifts: [0x10, 0x15],
        order: [0x00, 0x01],
        title: "Extend Sign Word (extsw)",
        help: "Sign-extends the low 32 bits of rS into 64 bits and stores in rD",
        example: "extsw r27, r25"
    },
    {
        name: "fneg",
        opCode: 0xFC000050,
        type: "typeFNAN",
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x0B],
        order: [0x00, 0x01],
        title: "Floating Point Negate (fneg)",
        help: "Negates the contents of frA and stores the result into frD",
        example: "fneg f1, f2"
    },
    {
        name: "rlwinm",
        opCode: 0x54000000,
        type: "typeNAN",
        opShift: null,
        shifts: [0x15, 0x10, 0x0B, 0x06, 0x01],   // rS, rA, SH, MB, ME
        order:  [0x01, 0x00, 0x02, 0x03, 0x04],   // rA, rS, SH, MB, ME
        title: "Rotate Left Word Immediate then AND with Mask (rlwinm)",
        help: "Rotates the low 32-bit word of rS left by SH, then ANDs it with the mask from bit MB to bit ME, storing the result in rA.",
        example: "rlwinm r3, r4, 0, 16, 31"
    },
    {
        name: "rlwinm.",
        opCode: 0x54000001, // same as rlwinm, but Rc bit set
        type: "typeNAN",
        opShift: null,
        shifts: [0x15, 0x10, 0x0B, 0x06, 0x01],   // rS, rA, SH, MB, ME
        order:  [0x01, 0x00, 0x02, 0x03, 0x04],   // rA, rS, SH, MB, ME
        title: "Rotate Left Word Immediate then AND with Mask and Record (rlwinm.)",
        help: "Same as rlwinm, and also updates CR0 with the result.",
        example: "rlwinm. r3, r3, 1, 0, 31"
    },
    {
        name: "srawi",
        opCode: 0x7C000670,
        type: "typeIMM5",
        opShift: null,
        shifts: [0x15, 0x10, 0x0B],     // rS, rA, SH
        order:  [0x01, 0x00, 0x02],     // rA, rS, SH
        title: "Shift Right Arithmetic Word Immediate (srawi)",
        help: "Arithmetically shifts the low 32-bit word of rS right by SH bits (sign-extending), storing the result in rA.",
        example: "srawi r3, r4, 4"
    },
    {
        name: "srawi.",
        opCode: 0x7C000671, // Rc bit set
        type: "typeIMM5",
        opShift: null,
        shifts: [0x15, 0x10, 0x0B],     // rS, rA, SH
        order:  [0x01, 0x00, 0x02],     // rA, rS, SH
        title: "Shift Right Arithmetic Word Immediate and Record (srawi.)",
        help: "Same as srawi, and also updates CR0 with the result.",
        example: "srawi. r3, r4, 4"
    },

    // ops beyond the base table, verified against rpcs3 patch bytes
    {
        name: "subfc",
        opCode: 0x7C000010,
        type: "typeNAN",
        opShift: [0x09, 0x00],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Subtract From Carrying (subfc)",
        help: "Subfc rD, rA, rB :: rD = rB - rA, sets carry",
        example: "subfc r4, r9, r4"
    },
    {
        name: "addc",
        opCode: 0x7C000014,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Add Carrying (addc)",
        help: "Addc rD, rA, rB :: rD = rA + rB, sets carry",
        example: "addc r4, r4, r8"
    },
    {
        name: "divwu",
        opCode: 0x7C000396,
        type: "typeNAN",
        opShift: [0x06, 0x0A],
        shifts: [0x15, 0x10, 0x0B],
        order: [0x00, 0x01, 0x02],
        title: "Divide Word Unsigned (divwu)",
        help: "Divwu rD, rA, rB :: rD = rA / rB (unsigned)",
        example: "divwu r4, r3, r4"
    },
    {
        name: "mftb",
        opCode: 0x7C0C42E6,
        type: "typeNAN",
        opShift: null,
        shifts: [0x15],
        order: [0x00],
        title: "Move From Time Base (mftb)",
        help: "Mftb rD :: rD = time base lower (TBL)",
        example: "mftb r21"
    },
    {
        name: "sc",
        opCode: 0x44000002,
        type: "typeNAN",
        opShift: null,
        shifts: [],
        order: [],
        title: "System Call (sc)",
        help: "Triggers a system call.",
        example: "sc"
    },
    {
        name: "neg",
        opCode: 0x7C0000D0,
        type: "typeNAN",
        opShift: [0x06, 0x00],
        shifts: [0x15, 0x10],
        order: [0x00, 0x01],
        title: "Negate (neg)",
        help: "Neg rD, rA :: rD = -rA",
        example: "neg r3, r4"
    },

    // extended integer arithmetic
    { name: "adde", opCode: 0x7C000114, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Add Extended (adde)", help: "Adds rA, rB and the carry bit (CA), storing the result in rD.", example: "adde r3, r4, r5" },
    { name: "subfe", opCode: 0x7C000110, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Subtract From Extended (subfe)", help: "rD = rB - rA - 1 + carry (CA).", example: "subfe r3, r4, r5" },
    { name: "mulhw", opCode: 0x7C000096, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Multiply High Word (mulhw)", help: "Stores the high 32 bits of the signed product rA * rB in rD.", example: "mulhw r3, r4, r5" },
    { name: "mulhwu", opCode: 0x7C000016, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Multiply High Word Unsigned (mulhwu)", help: "Stores the high 32 bits of the unsigned product rA * rB in rD.", example: "mulhwu r3, r4, r5" },
    { name: "mulld", opCode: 0x7C0001D2, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Multiply Low Doubleword (mulld)", help: "Stores the low 64 bits of the product rA * rB in rD.", example: "mulld r3, r4, r5" },
    { name: "divd", opCode: 0x7C0003D2, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Divide Doubleword (divd)", help: "rD = rA / rB, signed 64-bit.", example: "divd r3, r4, r5" },
    { name: "divdu", opCode: 0x7C000392, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Divide Doubleword Unsigned (divdu)", help: "rD = rA / rB, unsigned 64-bit.", example: "divdu r3, r4, r5" },

    // carry/extend forms with no rB
    { name: "addme", opCode: 0x7C0001D4, type: "typeNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10], order: [0x00, 0x01],
      title: "Add to Minus One Extended (addme)", help: "rD = rA + carry (CA) - 1.", example: "addme r3, r4" },
    { name: "addze", opCode: 0x7C000194, type: "typeNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10], order: [0x00, 0x01],
      title: "Add to Zero Extended (addze)", help: "rD = rA + carry (CA).", example: "addze r3, r4" },
    { name: "subfme", opCode: 0x7C0001D0, type: "typeNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10], order: [0x00, 0x01],
      title: "Subtract From Minus One Extended (subfme)", help: "rD = -rA + carry (CA) - 1.", example: "subfme r3, r4" },
    { name: "subfze", opCode: 0x7C000190, type: "typeNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10], order: [0x00, 0x01],
      title: "Subtract From Zero Extended (subfze)", help: "rD = -rA + carry (CA).", example: "subfze r3, r4" },

    // logical, result in rA (dest first, matches and/or)
    { name: "nand", opCode: 0x7C0003B8, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "NAND (nand)", help: "NANDs rS with rB, storing the result in rA.", example: "nand r3, r4, r5" },
    { name: "nor", opCode: 0x7C0000F8, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "NOR (nor)", help: "NORs rS with rB, storing the result in rA. nor rA, rS, rS negates.", example: "nor r3, r4, r5" },
    { name: "andc", opCode: 0x7C000078, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "AND with Complement (andc)", help: "ANDs rS with the complement of rB, storing the result in rA.", example: "andc r3, r4, r5" },
    { name: "orc", opCode: 0x7C000338, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "OR with Complement (orc)", help: "ORs rS with the complement of rB, storing the result in rA.", example: "orc r3, r4, r5" },
    { name: "eqv", opCode: 0x7C000238, type: "typeNAN", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "Equivalent (eqv)", help: "Stores the complement of rS XOR rB into rA.", example: "eqv r3, r4, r5" },

    // rotate, 32-bit mask insert
    { name: "rlwimi", opCode: 0x50000000, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B, 0x06, 0x01], order: [0x01, 0x00, 0x02, 0x03, 0x04],
      title: "Rotate Left Word Immediate then Mask Insert (rlwimi)", help: "Rotates the low word of rS left by SH, then inserts bits MB..ME into rA, leaving the rest of rA unchanged.", example: "rlwimi r3, r4, 8, 16, 23" },
    { name: "rlwnm", opCode: 0x5C000000, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B, 0x06, 0x01], order: [0x01, 0x00, 0x02, 0x03, 0x04],
      title: "Rotate Left Word then AND with Mask (rlwnm)", help: "Rotates the low word of rS left by the count in rB, then keeps only bits MB..ME into rA. Like rlwinm but the shift is a register.", example: "rlwnm r3, r4, r5, 0, 31" },

    // load/store, algebraic + update forms
    { name: "lha", opCode: 0xA8000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Halfword Algebraic (lha)", help: "Loads a sign-extended halfword from offset(rA) into rD.", example: "lha r3, 0x10(r4)" },
    { name: "lhau", opCode: 0xAC000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Halfword Algebraic with Update (lhau)", help: "Loads a sign-extended halfword from offset(rA) into rD and writes the address back to rA.", example: "lhau r3, 0x10(r4)" },
    { name: "lbzu", opCode: 0x8C000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Byte and Zero with Update (lbzu)", help: "Loads a zero-extended byte from offset(rA) into rD and writes the address back to rA.", example: "lbzu r3, 0x1(r4)" },
    { name: "lhzu", opCode: 0xA4000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Halfword and Zero with Update (lhzu)", help: "Loads a zero-extended halfword from offset(rA) into rD and writes the address back to rA.", example: "lhzu r3, 0x2(r4)" },
    { name: "lwzu", opCode: 0x84000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Word and Zero with Update (lwzu)", help: "Loads a zero-extended word from offset(rA) into rD and writes the address back to rA.", example: "lwzu r3, 0x4(r4)" },
    { name: "stbu", opCode: 0x9C000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Store Byte with Update (stbu)", help: "Stores the low byte of rS to offset(rA) and writes the address back to rA.", example: "stbu r3, 0x1(r4)" },
    { name: "sthu", opCode: 0xB4000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Store Halfword with Update (sthu)", help: "Stores the low halfword of rS to offset(rA) and writes the address back to rA.", example: "sthu r3, 0x2(r4)" },
    { name: "ldu", opCode: 0xE8000001, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Doubleword with Update (ldu)", help: "Loads a doubleword from offset(rA) into rD and writes the address back to rA. offset must be a multiple of 4.", example: "ldu r3, 0x8(r4)" },
    { name: "lwa", opCode: 0xE8000002, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Word Algebraic (lwa)", help: "Loads a sign-extended word from offset(rA) into rD. offset must be a multiple of 4.", example: "lwa r3, 0x8(r4)" },

    // floating point, 2-reg (frD, frB)
    { name: "fabs", opCode: 0xFC000210, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Absolute Value (fabs)", help: "Stores the absolute value of frB into frD.", example: "fabs f1, f2" },
    { name: "fnabs", opCode: 0xFC000110, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Negative Absolute Value (fnabs)", help: "Stores the negated absolute value of frB into frD.", example: "fnabs f1, f2" },
    { name: "fctiw", opCode: 0xFC00001C, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Convert to Integer Word (fctiw)", help: "Converts frB to a 32-bit integer using the current rounding mode, result in frD.", example: "fctiw f1, f2" },
    { name: "fctiwz", opCode: 0xFC00001E, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Convert to Integer Word toward Zero (fctiwz)", help: "Converts frB to a 32-bit integer, truncating toward zero, result in frD.", example: "fctiwz f1, f2" },
    { name: "fctid", opCode: 0xFC00065C, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Convert to Integer Doubleword (fctid)", help: "Converts frB to a 64-bit integer using the current rounding mode, result in frD.", example: "fctid f1, f2" },
    { name: "fctidz", opCode: 0xFC00065E, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Convert to Integer Doubleword toward Zero (fctidz)", help: "Converts frB to a 64-bit integer, truncating toward zero, result in frD.", example: "fctidz f1, f2" },
    { name: "fres", opCode: 0xEC000030, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Reciprocal Estimate Single (fres)", help: "Estimates 1 / frB (single precision), result in frD.", example: "fres f1, f2" },
    { name: "frsqrte", opCode: 0xFC000034, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Reciprocal Square Root Estimate (frsqrte)", help: "Estimates 1 / sqrt(frB), result in frD.", example: "frsqrte f1, f2" },

    // floating point, multiply-add family (frD, frA, frC, frB)
    { name: "fmsub", opCode: 0xFC000038, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Multiply-Subtract (fmsub)", help: "Multiplies frA by frC, subtracts frB, result in frD.", example: "fmsub f1, f2, f5, f3" },
    { name: "fnmadd", opCode: 0xFC00003E, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Negative Multiply-Add (fnmadd)", help: "Multiplies frA by frC, adds frB, negates, result in frD.", example: "fnmadd f1, f2, f5, f3" },
    { name: "fnmsub", opCode: 0xFC00003C, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Negative Multiply-Subtract (fnmsub)", help: "Multiplies frA by frC, subtracts frB, negates, result in frD.", example: "fnmsub f1, f2, f5, f3" },
    { name: "fsel", opCode: 0xFC00002E, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Select (fsel)", help: "frD = frC if frA >= 0, else frB.", example: "fsel f1, f2, f5, f3" },
    { name: "fmsubs", opCode: 0xEC000038, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Multiply-Subtract Single (fmsubs)", help: "Single-precision fmsub.", example: "fmsubs f1, f2, f5, f3" },
    { name: "fnmadds", opCode: 0xEC00003E, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Negative Multiply-Add Single (fnmadds)", help: "Single-precision fnmadd.", example: "fnmadds f1, f2, f5, f3" },
    { name: "fnmsubs", opCode: 0xEC00003C, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x0B, 0x06], order: [0x00, 0x01, 0x03, 0x02],
      title: "Floating Negative Multiply-Subtract Single (fnmsubs)", help: "Single-precision fnmsub.", example: "fnmsubs f1, f2, f5, f3" },

    // condition register
    { name: "mfcr", opCode: 0x7C000026, type: "typeNAN", opShift: null, shifts: [0x15], order: [0x00],
      title: "Move From Condition Register (mfcr)", help: "Copies the 32-bit condition register into rD.", example: "mfcr r3" },

    // load/store multiple
    { name: "lmw", opCode: 0xB8000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Multiple Word (lmw)", help: "Loads consecutive words from offset(rA) into rD through r31.", example: "lmw r26, 0x8(r1)" },
    { name: "stmw", opCode: 0xBC000000, type: "typeOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Store Multiple Word (stmw)", help: "Stores rS through r31 to consecutive words at offset(rA).", example: "stmw r26, 0x8(r1)" },

    // move to/from cr fields, CRM is an 8-bit mask immediate. the ocrf forms
    // touch a single field (the fast path compilers emit)
    { name: "mtcrf", opCode: 0x7C000120, type: "typeNAN", opShift: null, shifts: [0x15, 0x0C], order: [0x01, 0x00],
      title: "Move To CR Fields (mtcrf)", help: "Copies rS into the CR fields picked by the 8-bit mask CRM.", example: "mtcrf 0xFF, r3" },
    { name: "mtocrf", opCode: 0x7C100120, type: "typeNAN", opShift: null, shifts: [0x15, 0x0C], order: [0x01, 0x00],
      title: "Move To One CR Field (mtocrf)", help: "Copies rS into the single CR field picked by CRM.", example: "mtocrf 0x80, r3" },
    { name: "mfocrf", opCode: 0x7C100026, type: "typeNAN", opShift: null, shifts: [0x15, 0x0C], order: [0x00, 0x01],
      title: "Move From One CR Field (mfocrf)", help: "Copies the single CR field picked by CRM into rD.", example: "mfocrf r0, 0x80" },

    // condition-register bit logical (operands are cr bit indices 0-31)
    { name: "crand", opCode: 0x4C000202, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register AND (crand)", help: "crbD = crbA AND crbB (CR bit indices 0-31).", example: "crand 0, 1, 2" },
    { name: "cror", opCode: 0x4C000382, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register OR (cror)", help: "crbD = crbA OR crbB. cror bx, by, by moves a bit.", example: "cror 0, 1, 2" },
    { name: "crxor", opCode: 0x4C000182, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register XOR (crxor)", help: "crbD = crbA XOR crbB. crxor bx, bx, bx clears a bit.", example: "crxor 0, 1, 2" },
    { name: "crnand", opCode: 0x4C0001C2, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register NAND (crnand)", help: "crbD = NOT (crbA AND crbB).", example: "crnand 0, 1, 2" },
    { name: "crnor", opCode: 0x4C000042, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register NOR (crnor)", help: "crbD = NOT (crbA OR crbB). crnor bx, by, by inverts a bit.", example: "crnor 0, 1, 2" },
    { name: "creqv", opCode: 0x4C000242, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register Equivalent (creqv)", help: "crbD = NOT (crbA XOR crbB). creqv bx, bx, bx sets a bit.", example: "creqv 0, 1, 2" },
    { name: "crandc", opCode: 0x4C000102, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register AND with Complement (crandc)", help: "crbD = crbA AND NOT crbB.", example: "crandc 0, 1, 2" },
    { name: "crorc", opCode: 0x4C000342, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Condition Register OR with Complement (crorc)", help: "crbD = crbA OR NOT crbB.", example: "crorc 0, 1, 2" },

    // counted-loop branches (ctr)
    { name: "bdnz", opCode: 0x42000000, type: "typeBNCMP", opShift: [0x0B, 0x00], shifts: [0x02], order: [0x00],
      title: "Decrement CTR, Branch if Nonzero (bdnz)", help: "Decrements CTR, branches to the target while CTR != 0. Use a label for a loop.", example: "bdnz 0x8" },
    { name: "bdz", opCode: 0x42400000, type: "typeBNCMP", opShift: [0x0B, 0x00], shifts: [0x02], order: [0x00],
      title: "Decrement CTR, Branch if Zero (bdz)", help: "Decrements CTR, branches to the target when CTR == 0. Use a label for a loop.", example: "bdz 0x8" },

    // register shifts
    { name: "sld", opCode: 0x7C000036, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "Shift Left Doubleword (sld)", help: "Shifts rS left by rB bits (0..63), result in rA.", example: "sld r3, r4, r5" },
    { name: "srd", opCode: 0x7C000436, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "Shift Right Doubleword (srd)", help: "Logical right shift of rS by rB bits, result in rA.", example: "srd r3, r4, r5" },
    { name: "srad", opCode: 0x7C000634, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "Shift Right Algebraic Doubleword (srad)", help: "Arithmetic (sign-preserving) right shift of rS by rB, result in rA.", example: "srad r3, r4, r5" },
    { name: "sraw", opCode: 0x7C000630, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x01, 0x00, 0x02],
      title: "Shift Right Algebraic Word (sraw)", help: "Arithmetic right shift of the low word of rS by rB, result in rA.", example: "sraw r3, r4, r5" },

    { name: "mulhd", opCode: 0x7C000092, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Multiply High Doubleword (mulhd)", help: "Stores the high 64 bits of the signed product rA * rB in rD.", example: "mulhd r3, r4, r5" },
    { name: "mulhdu", opCode: 0x7C000012, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Multiply High Doubleword Unsigned (mulhdu)", help: "Stores the high 64 bits of the unsigned product rA * rB in rD.", example: "mulhdu r3, r4, r5" },
    { name: "cntlzd", opCode: 0x7C000074, type: "typeNAN", opShift: null, shifts: [0x15, 0x10], order: [0x01, 0x00],
      title: "Count Leading Zeros Doubleword (cntlzd)", help: "Counts the leading zero bits of rS (0..64) into rA.", example: "cntlzd r3, r4" },

    { name: "cmpdi", opCode: 0x2C200000, type: "typeCND", opShift: [0x0B, 0x00], shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Compare Doubleword Immediate (cmpdi)", help: "Signed 64-bit compare of rA with SIMM into a CR field (cr0 if omitted).", example: "cmpdi r4, 0x10" },
    { name: "cmpdi", opCode: 0x2C200000, type: "typeCND", opShift: [0x0B, 0x00], shifts: [0x17, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Compare Doubleword Immediate (cmpdi)", help: "Signed 64-bit compare of rA with SIMM into crfD.", example: "cmpdi cr2, r4, 0x10" },
    { name: "cmpldi", opCode: 0x28200000, type: "typeCND", opShift: [0x0B, 0x00], shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Compare Logical Doubleword Immediate (cmpldi)", help: "Unsigned 64-bit compare of rA with UIMM into a CR field.", example: "cmpldi r4, 0x10" },
    { name: "cmpldi", opCode: 0x28200000, type: "typeCND", opShift: [0x0B, 0x00], shifts: [0x17, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Compare Logical Doubleword Immediate (cmpldi)", help: "Unsigned 64-bit compare of rA with UIMM into crfD.", example: "cmpldi cr2, r4, 0x10" },
    { name: "cmpld", opCode: 0x7C200040, type: "typeCND", opShift: [0x0B, 0x00], shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Compare Logical Doubleword (cmpld)", help: "Unsigned 64-bit compare of rA with rB into a CR field.", example: "cmpld r4, r5" },
    { name: "cmpld", opCode: 0x7C200040, type: "typeCND", opShift: [0x0B, 0x00], shifts: [0x17, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Compare Logical Doubleword (cmpld)", help: "Unsigned 64-bit compare of rA with rB into crfD.", example: "cmpld cr2, r4, r5" },

    { name: "lhax", opCode: 0x7C0002AE, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Halfword Algebraic Indexed (lhax)", help: "Loads a sign-extended halfword from rA + rB into rD.", example: "lhax r3, r4, r5" },
    { name: "lwax", opCode: 0x7C0002AA, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Word Algebraic Indexed (lwax)", help: "Loads a sign-extended word from rA + rB into rD.", example: "lwax r3, r4, r5" },
    { name: "lfsx", opCode: 0x7C00042E, type: "typeFONE", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Float Single Indexed (lfsx)", help: "Loads a single-precision float from rA + rB into fD.", example: "lfsx f1, r3, r4" },
    { name: "lfdx", opCode: 0x7C0004AE, type: "typeFONE", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Float Double Indexed (lfdx)", help: "Loads a double-precision float from rA + rB into fD.", example: "lfdx f1, r3, r4" },
    { name: "stfdx", opCode: 0x7C0005AE, type: "typeFONE", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Float Double Indexed (stfdx)", help: "Stores fS to rA + rB as a double.", example: "stfdx f1, r3, r4" },

    { name: "lfsu", opCode: 0xC4000000, type: "typeFOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Float Single with Update (lfsu)", help: "Loads a single from offset(rA) into fD and writes the address back to rA.", example: "lfsu f1, 0x4(r4)" },
    { name: "lfdu", opCode: 0xCC000000, type: "typeFOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Load Float Double with Update (lfdu)", help: "Loads a double from offset(rA) into fD and writes the address back to rA.", example: "lfdu f1, 0x8(r4)" },
    { name: "stfsu", opCode: 0xD4000000, type: "typeFOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Store Float Single with Update (stfsu)", help: "Stores fS to offset(rA) and writes the address back to rA.", example: "stfsu f1, 0x4(r4)" },
    { name: "stfdu", opCode: 0xDC000000, type: "typeFOFI", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Store Float Double with Update (stfdu)", help: "Stores fS to offset(rA) and writes the address back to rA.", example: "stfdu f1, 0x8(r4)" },

    { name: "ldarx", opCode: 0x7C0000A8, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Doubleword and Reserve Indexed (ldarx)", help: "Loads a doubleword from rA + rB into rD and sets a reservation for a following stdcx.", example: "ldarx r3, r4, r5" },
    { name: "stdcx.", opCode: 0x7C0001AD, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Doubleword Conditional Indexed (stdcx.)", help: "Conditionally stores rS to rA + rB while the ldarx reservation holds. Updates cr0.", example: "stdcx. r3, r4, r5" },

    { name: "dcbf", opCode: 0x7C0000AC, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Data Cache Block Flush (dcbf)", help: "Flushes the data-cache block for rA + rB back to memory and invalidates it.", example: "dcbf r3, r4" },
    { name: "dcbst", opCode: 0x7C00006C, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Data Cache Block Store (dcbst)", help: "Writes the data-cache block for rA + rB back to memory.", example: "dcbst r3, r4" },
    { name: "dcbt", opCode: 0x7C00022C, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Data Cache Block Touch (dcbt)", help: "A prefetch hint for the data-cache block at rA + rB.", example: "dcbt r3, r4" },
    { name: "dcbtst", opCode: 0x7C0001EC, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Data Cache Block Touch for Store (dcbtst)", help: "A prefetch-for-write hint for the data-cache block at rA + rB.", example: "dcbtst r3, r4" },

    { name: "subfic", opCode: 0x20000000, type: "typeIMM", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Subtract From Immediate Carrying (subfic)", help: "Computes IMM - rA into rD and sets the carry bit. Note the operand order: the register is subtracted from the immediate.", example: "subfic r3, r4, 0x10" },
    { name: "stfiwx", opCode: 0x7C0007AE, type: "typeFONE", opShift: [0x06, 0x0A], shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Floating Point as Integer Word Indexed (stfiwx)", help: "Stores the low 32 bits of fS to rA + rB without conversion. Common right after fctiwz.", example: "stfiwx f1, r3, r4" },
    { name: "stdux", opCode: 0x7C00016A, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Doubleword with Update Indexed (stdux)", help: "Stores rS to rA + rB, then writes that address back into rA.", example: "stdux r3, r4, r5" },
    { name: "addic.", opCode: 0x34000000, type: "typeIMM", opShift: [0x06, 0x00], shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Add Immediate Carrying and Record (addic.)", help: "Adds the signed IMM to rA into rD, sets the carry bit, and compares the result against zero in cr0.", example: "addic. r3, r4, 0x10" },
    { name: "lswi", opCode: 0x7C0004AA, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load String Word Immediate (lswi)", help: "Loads NB bytes (0 means 32) from rA into consecutive registers starting at rD.", example: "lswi r5, r3, 8" },
    { name: "stswi", opCode: 0x7C0005AA, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store String Word Immediate (stswi)", help: "Stores NB bytes (0 means 32) from consecutive registers starting at rS to rA.", example: "stswi r5, r3, 8" },

    { name: "fcmpo", opCode: 0xFC000040, type: "typeFCND", opShift: [0x0B, 0x00], shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Floating Compare Ordered (fcmpo)", help: "Ordered compare of fA with fB into a CR field (cr0 if omitted).", example: "fcmpo f1, f2" },
    { name: "fcmpo", opCode: 0xFC000040, type: "typeFCND", opShift: [0x0B, 0x00], shifts: [0x17, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Floating Compare Ordered (fcmpo)", help: "Ordered compare of fA with fB into crfD.", example: "fcmpo cr2, f1, f2" },
    { name: "fsqrts", opCode: 0xEC00002C, type: "typeFNAN", opShift: [0x06, 0x00], shifts: [0x15, 0x0B], order: [0x00, 0x01],
      title: "Floating Square Root Single (fsqrts)", help: "Single-precision square root of fB into fD.", example: "fsqrts f1, f2" },
    { name: "mffs", opCode: 0xFC00048E, type: "typeFNAN", opShift: null, shifts: [0x15], order: [0x00],
      title: "Move From FPSCR (mffs)", help: "Copies the FPSCR into fD.", example: "mffs f0" },

    // trap family. TO mask: 16 lt, 8 gt, 4 eq, 2 ltu, 1 gtu (add to combine, 31 = any)
    { name: "tw", opCode: 0x7FE00008, type: "typeNAN", opShift: null, shifts: [], order: [],
      title: "Trap Word (unconditional)", help: "Bare tw traps unconditionally.", example: "tw" },
    { name: "twi", opCode: 0x0C000000, type: "typeIMM", opShift: null, shifts: [0x15, 0x10, 0x00], order: [0x00, 0x01, 0x02],
      title: "Trap Word Immediate (twi)", help: "Traps when the signed comparison of rA with SIMM matches the 5-bit TO condition.", example: "twi 4, r0, 10" },

    // conditional trap, register form (tw <TO>, rA, rB)
    { name: "tweq", opCode: 0x7C800008, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Trap if Equal (tweq)", help: "Traps if rA == rB.", example: "tweq r3, r4" },
    { name: "twne", opCode: 0x7F000008, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Trap if Not Equal (twne)", help: "Traps if rA != rB.", example: "twne r3, r4" },
    { name: "twlt", opCode: 0x7E000008, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Trap if Less Than (twlt)", help: "Traps if rA < rB (signed).", example: "twlt r3, r4" },
    { name: "twgt", opCode: 0x7D000008, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Trap if Greater Than (twgt)", help: "Traps if rA > rB (signed).", example: "twgt r3, r4" },
    { name: "twle", opCode: 0x7E800008, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Trap if Less or Equal (twle)", help: "Traps if rA <= rB (signed).", example: "twle r3, r4" },
    { name: "twge", opCode: 0x7D800008, type: "typeNAN", opShift: null, shifts: [0x10, 0x0B], order: [0x00, 0x01],
      title: "Trap if Greater or Equal (twge)", help: "Traps if rA >= rB (signed).", example: "twge r3, r4" },

    // conditional trap, immediate form (twi <TO>, rA, SIMM)
    { name: "tweqi", opCode: 0x0C800000, type: "typeIMM", opShift: null, shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Trap if Equal Immediate (tweqi)", help: "Traps if rA == SIMM.", example: "tweqi r0, 10" },
    { name: "twnei", opCode: 0x0F000000, type: "typeIMM", opShift: null, shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Trap if Not Equal Immediate (twnei)", help: "Traps if rA != SIMM.", example: "twnei r0, 10" },
    { name: "twlti", opCode: 0x0E000000, type: "typeIMM", opShift: null, shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Trap if Less Than Immediate (twlti)", help: "Traps if rA < SIMM (signed).", example: "twlti r0, 10" },
    { name: "twgti", opCode: 0x0D000000, type: "typeIMM", opShift: null, shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Trap if Greater Than Immediate (twgti)", help: "Traps if rA > SIMM (signed).", example: "twgti r0, 10" },
    { name: "twlei", opCode: 0x0E800000, type: "typeIMM", opShift: null, shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Trap if Less or Equal Immediate (twlei)", help: "Traps if rA <= SIMM (signed).", example: "twlei r0, 10" },
    { name: "twgei", opCode: 0x0D800000, type: "typeIMM", opShift: null, shifts: [0x10, 0x00], order: [0x00, 0x01],
      title: "Trap if Greater or Equal Immediate (twgei)", help: "Traps if rA >= SIMM (signed).", example: "twgei r0, 10" },

    // conditional returns (bclr with a cr0 condition baked in)
    // conditional returns (bXXlr) and computed branches (bXXctr) are generated
    // by withRegBranches below, covering cr0, crN, and +/- hints.

    // byte-reverse (endian-swap) indexed load/store
    { name: "lwbrx", opCode: 0x7C00042C, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Word Byte-Reverse Indexed (lwbrx)", help: "Loads a word from rA + rB into rD, byte-swapped (little-endian).", example: "lwbrx r3, r4, r5" },
    { name: "stwbrx", opCode: 0x7C00052C, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Word Byte-Reverse Indexed (stwbrx)", help: "Stores rS to rA + rB, byte-swapped.", example: "stwbrx r3, r4, r5" },
    { name: "lhbrx", opCode: 0x7C00062C, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Halfword Byte-Reverse Indexed (lhbrx)", help: "Loads a halfword from rA + rB into rD, byte-swapped.", example: "lhbrx r3, r4, r5" },
    { name: "sthbrx", opCode: 0x7C00072C, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Halfword Byte-Reverse Indexed (sthbrx)", help: "Stores the low halfword of rS to rA + rB, byte-swapped.", example: "sthbrx r3, r4, r5" },
    { name: "ldbrx", opCode: 0x7C000428, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Load Doubleword Byte-Reverse Indexed (ldbrx)", help: "Loads a doubleword from rA + rB into rD, byte-swapped.", example: "ldbrx r3, r4, r5" },
    { name: "stdbrx", opCode: 0x7C000528, type: "typeNAN", opShift: null, shifts: [0x15, 0x10, 0x0B], order: [0x00, 0x01, 0x02],
      title: "Store Doubleword Byte-Reverse Indexed (stdbrx)", help: "Stores rS to rA + rB, byte-swapped.", example: "stdbrx r3, r4, r5" },

    // 64-bit rotate-and-mask (md-form) + algebraic shift immediate (xs-form)
    { name: "rldicl", opCode: 0x78000000, type: "typeMD", opShift: null, shifts: [], order: [0x00, 0x01, 0x02, 0x03],
      title: "Rotate Left Doubleword Immediate then Clear Left (rldicl)", help: "Rotates rS left by SH, then clears the top MB bits, into rA.", example: "rldicl r3, r4, 8, 16" },
    { name: "rldicr", opCode: 0x78000004, type: "typeMD", opShift: null, shifts: [], order: [0x00, 0x01, 0x02, 0x03],
      title: "Rotate Left Doubleword Immediate then Clear Right (rldicr)", help: "Rotates rS left by SH, then clears everything past bit ME, into rA.", example: "rldicr r3, r4, 8, 47" },
    { name: "rldic", opCode: 0x78000008, type: "typeMD", opShift: null, shifts: [], order: [0x00, 0x01, 0x02, 0x03],
      title: "Rotate Left Doubleword Immediate then Clear (rldic)", help: "Rotates rS left by SH, then clears the top MB bits and the low SH bits, into rA.", example: "rldic r3, r4, 8, 16" },
    { name: "rldimi", opCode: 0x7800000C, type: "typeMD", opShift: null, shifts: [], order: [0x00, 0x01, 0x02, 0x03],
      title: "Rotate Left Doubleword Immediate then Mask Insert (rldimi)", help: "Rotates rS left by SH, then inserts bits from MB into rA, leaving the rest unchanged.", example: "rldimi r3, r4, 8, 16" },
    { name: "sradi", opCode: 0x7C000674, type: "typeXS", opShift: null, shifts: [], order: [0x00, 0x01, 0x02],
      title: "Shift Right Algebraic Doubleword Immediate (sradi)", help: "Arithmetic (sign-preserving) right shift of rS by SH bits (0..63), into rA.", example: "sradi r3, r4, 8" },
];

// record (Rc) sets bit 31, overflow (OE) sets bit 21 (0x400).
// synthesize these forms from the base ops that support them, no
// hand-writing every dot/overflow variant.
const RC_CAPABLE = new Set([
    "add", "addc", "adde", "addme", "addze",
    "subf", "subfc", "subfe", "subfme", "subfze",
    "neg", "mullw", "mulhw", "mulhwu", "mulld", "mulhd", "mulhdu",
    "divw", "divwu", "divd", "divdu",
    "and", "andc", "or", "orc", "xor", "nand", "nor", "eqv",
    "slw", "srw", "sraw", "srawi", "sld", "srd", "srad", "sradi",
    "rlwinm", "rlwnm", "rlwimi", "rldicl", "rldicr", "rldic", "rldimi", "rldcl", "rldcr",
    "extsb", "extsh", "extsw", "cntlzw", "cntlzd"
]);

const OE_CAPABLE = new Set([
    "add", "addc", "adde", "addme", "addze",
    "subf", "subfc", "subfe", "subfme", "subfze",
    "neg", "mullw", "mulld", "divw", "divwu", "divd", "divdu"
]);

function withRcOeForms(list) {
    const have = new Set(list.map(i => i.name.toLowerCase()));
    const out = list.slice();

    // what the record (.) and overflow (o) suffixes add to the base op
    function suffixNote(suffix) {
        if (suffix === ".") return " Also updates CR0 with the result.";
        if (suffix === "o") return " Also updates the overflow bit (OV) in XER.";
        return " Also updates CR0 and the overflow bit (OV) in XER.";
    }

    // keep any explicit variant, only synthesize missing ones
    function add(base, suffix, orBits) {
        const name = base.name.toLowerCase() + suffix;
        if (have.has(name)) return;
        have.add(name);
        let title = base.title || name;
        title = /\([^)]*\)\s*$/.test(title)
            ? title.replace(/\s*\([^)]*\)\s*$/, ` (${name})`)
            : `${title} (${name})`;
        const h = (base.help || "").trim();
        const help = ((h ? (/[.!?]$/.test(h) ? h : h + ".") : "") + suffixNote(suffix)).trim();
        const example = base.example ? base.example.replace(/^(\s*)\S+/, `$1${name}`) : "";
        out.push({ ...base, name, opCode: (base.opCode | orBits) >>> 0, title, help, example });
    }

    for (const ins of list) {
        const n = ins.name.toLowerCase();
        if (RC_CAPABLE.has(n)) add(ins, ".", 0x1);
        if (OE_CAPABLE.has(n)) { add(ins, "o", 0x400); add(ins, "o.", 0x401); }
    }
    return out;
}

// branch-prediction hint variants (beq+/beq-/bne+/...). the hint is the low 2
// bits of BO: taken base BO 12 -> +15/-14, not-taken base BO 4 -> +7/-6.
function withBranchHints(list) {
    const out = list.slice();
    const CONDS = new Set(['beq', 'bne', 'blt', 'ble', 'bgt', 'bge', 'bso', 'bns']);
    for (const ins of list) {
        if (ins.type !== 'typeBNCMP') continue;
        const n = ins.name.toLowerCase();
        if (!CONDS.has(n)) continue;
        const bo = (ins.opCode >>> 21) & 0x1f;
        let plus, minus;
        if (bo === 12) { plus = 15; minus = 14; }
        else if (bo === 4) { plus = 7; minus = 6; }
        else continue;
        const setBO = (v) => ((ins.opCode & ~(0x1f << 21)) | ((v & 0x1f) << 21)) >>> 0;
        for (const [suf, boVal] of [['+', plus], ['-', minus]]) {
            const name = n + suf;
            out.push({
                ...ins,
                name,
                opCode: setBO(boVal),
                title: /\([^)]*\)\s*$/.test(ins.title || '') ? ins.title.replace(/\s*\([^)]*\)\s*$/, ` (${name})`) : `${ins.title || name} (${name})`,
                example: ins.example ? ins.example.replace(/^(\s*)\S+/, `$1${name}`) : '',
            });
        }
    }
    return out;
}

// conditional branch to lr (return) / ctr (computed call, e.g. switch + vtable).
// each condition gets a cr0 (0-op) and crN (1-op, crf at bit 18) variant with
// +/- prediction hints. opcode 19, xo 16 = bclr, xo 528 = bcctr.
function withRegBranches(list) {
    const out = list.slice();
    const CONDS = [
        ['beq', 2, true, 'Equal'], ['bne', 2, false, 'Not Equal'],
        ['blt', 0, true, 'Less Than'], ['bge', 0, false, 'Greater or Equal'],
        ['bgt', 1, true, 'Greater Than'], ['ble', 1, false, 'Less or Equal'],
        ['bso', 3, true, 'Summary Overflow'], ['bns', 3, false, 'No Summary Overflow'],
    ];
    const TARGETS = [['lr', 16, 'Return if', 'returns to LR'], ['ctr', 528, 'Branch CTR if', 'branches to CTR']];
    const BIT = ['lt', 'gt', 'eq', 'so'];
    for (const [cond, condbit, isTrue, phrase] of CONDS) {
        const hints = isTrue ? [['', 12], ['+', 15], ['-', 14]] : [['', 4], ['+', 7], ['-', 6]];
        for (const [suf, tgt, verb, act] of TARGETS) {
            for (const [hsuf, bo] of hints) {
                const name = cond + suf + hsuf;
                const word = (0x4C000000 | (bo << 21) | (condbit << 16) | (tgt << 1)) >>> 0;
                const htxt = hsuf === '+' ? ', hinted taken' : hsuf === '-' ? ', hinted not taken' : '';
                const title = `${verb} ${phrase} (${name})`;
                const help = `If the ${BIT[condbit]} bit of the CR field (cr0 if omitted) ${isTrue ? 'is set' : 'is clear'}, ${act}${htxt}.`;
                out.push({ name, opCode: word, type: 'typeNAN', opShift: null, shifts: [], order: [], title, help, example: name });
                out.push({ name, opCode: word, type: 'typeNAN', opShift: null, shifts: [0x12], order: [0x00], title, help, example: `${name} cr6` });
            }
        }
    }
    return out;
}

// altivec / vmx compute set (opcode 4). forms:
//   VX3  vD, vA, vB          typeVREG3  shifts 21/16/11
//   VX2  vD, vB (unary)      typeVREG3  shifts 21/11
//   VX1  vD | vB (mfvscr/mtvscr)
//   VA4  vD, vA, vB, vC      typeVREG4  shifts 21/16/11/6, 6-bit xo
//   VXI  vD, .., IMM5 last   typeVX5    (splats + fp<->int converts + vsldoi)
//   VC   vD, vA, vB (+ Rc)   typeVREG3  10-bit xo, dot-form sets bit 10
function altivecOps() {
    const out = [];
    const OP4 = 0x10000000;
    const vx3 = (name, xo) => (OP4 | xo) >>> 0;
    const push = (name, opCode, type, shifts, order, title, help, example) =>
        out.push({ name, opCode: opCode >>> 0, type, opShift: null, shifts, order, title, help, example });
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    // VX3: vD, vA, vB
    const VX3 = [
        ['vaddubm', 0, 'add as unsigned bytes, modulo'], ['vadduhm', 64, 'add as unsigned halfwords, modulo'], ['vadduwm', 128, 'add as unsigned words, modulo'],
        ['vaddubs', 512, 'add as unsigned bytes, saturating'], ['vadduhs', 576, 'add as unsigned halfwords, saturating'], ['vadduws', 640, 'add as unsigned words, saturating'],
        ['vaddsbs', 768, 'add as signed bytes, saturating'], ['vaddshs', 832, 'add as signed halfwords, saturating'], ['vaddsws', 896, 'add as signed words, saturating'],
        ['vaddcuw', 384, 'add unsigned words, producing carry-out'],
        ['vsububm', 1024, 'subtract as unsigned bytes, modulo'], ['vsubuhm', 1088, 'subtract as unsigned halfwords, modulo'], ['vsubuwm', 1152, 'subtract as unsigned words, modulo'],
        ['vsububs', 1536, 'subtract as unsigned bytes, saturating'], ['vsubuhs', 1600, 'subtract as unsigned halfwords, saturating'], ['vsubuws', 1664, 'subtract as unsigned words, saturating'],
        ['vsubsbs', 1792, 'subtract as signed bytes, saturating'], ['vsubshs', 1856, 'subtract as signed halfwords, saturating'], ['vsubsws', 1920, 'subtract as signed words, saturating'],
        ['vsubcuw', 1408, 'subtract unsigned words, producing carry-out'],
        ['vmaxub', 2, 'maximum of unsigned bytes'], ['vmaxuh', 66, 'maximum of unsigned halfwords'], ['vmaxuw', 130, 'maximum of unsigned words'],
        ['vmaxsb', 258, 'maximum of signed bytes'], ['vmaxsh', 322, 'maximum of signed halfwords'], ['vmaxsw', 386, 'maximum of signed words'],
        ['vminub', 514, 'minimum of unsigned bytes'], ['vminuh', 578, 'minimum of unsigned halfwords'], ['vminuw', 642, 'minimum of unsigned words'],
        ['vminsb', 770, 'minimum of signed bytes'], ['vminsh', 834, 'minimum of signed halfwords'], ['vminsw', 898, 'minimum of signed words'],
        ['vavgub', 1026, 'average of unsigned bytes'], ['vavguh', 1090, 'average of unsigned halfwords'], ['vavguw', 1154, 'average of unsigned words'],
        ['vavgsb', 1282, 'average of signed bytes'], ['vavgsh', 1346, 'average of signed halfwords'], ['vavgsw', 1410, 'average of signed words'],
        ['vrlb', 4, 'rotate-left each byte'], ['vrlh', 68, 'rotate-left each halfword'], ['vrlw', 132, 'rotate-left each word'],
        ['vslb', 260, 'shift-left each byte'], ['vslh', 324, 'shift-left each halfword'], ['vslw', 388, 'shift-left each word'],
        ['vsrb', 516, 'shift-right each byte, logical'], ['vsrh', 580, 'shift-right each halfword, logical'], ['vsrw', 644, 'shift-right each word, logical'],
        ['vsrab', 772, 'shift-right each byte, algebraic'], ['vsrah', 836, 'shift-right each halfword, algebraic'], ['vsraw', 900, 'shift-right each word, algebraic'],
        ['vsl', 452, 'shift the whole vector left by bits'], ['vsr', 708, 'shift the whole vector right by bits'],
        ['vslo', 1036, 'shift the whole vector left by octets'], ['vsro', 1100, 'shift the whole vector right by octets'],
        ['vand', 1028, 'bitwise AND'], ['vandc', 1092, 'bitwise AND with complement of vB'], ['vor', 1156, 'bitwise OR'],
        ['vnor', 1284, 'bitwise NOR'], ['vxor', 1220, 'bitwise XOR'],
        ['vmrghb', 12, 'merge high bytes'], ['vmrghh', 76, 'merge high halfwords'], ['vmrghw', 140, 'merge high words'],
        ['vmrglb', 268, 'merge low bytes'], ['vmrglh', 332, 'merge low halfwords'], ['vmrglw', 396, 'merge low words'],
        ['vpkuhum', 14, 'pack unsigned halfwords to bytes, modulo'], ['vpkuwum', 78, 'pack unsigned words to halfwords, modulo'],
        ['vpkuhus', 142, 'pack unsigned halfwords to bytes, saturating'], ['vpkuwus', 206, 'pack unsigned words to halfwords, saturating'],
        ['vpkshus', 270, 'pack signed halfwords to unsigned bytes, saturating'], ['vpkswus', 334, 'pack signed words to unsigned halfwords, saturating'],
        ['vpkshss', 398, 'pack signed halfwords to signed bytes, saturating'], ['vpkswss', 462, 'pack signed words to signed halfwords, saturating'],
        ['vpkpx', 782, 'pack words to 1-5-5-5 pixels'],
        ['vmuloub', 8, 'multiply odd unsigned bytes'], ['vmulouh', 72, 'multiply odd unsigned halfwords'],
        ['vmulosb', 264, 'multiply odd signed bytes'], ['vmulosh', 328, 'multiply odd signed halfwords'],
        ['vmuleub', 520, 'multiply even unsigned bytes'], ['vmuleuh', 584, 'multiply even unsigned halfwords'],
        ['vmulesb', 776, 'multiply even signed bytes'], ['vmulesh', 840, 'multiply even signed halfwords'],
        ['vsum4ubs', 1544, 'sum unsigned byte quads into words, saturating'], ['vsum4sbs', 1800, 'sum signed byte quads into words, saturating'],
        ['vsum4shs', 1608, 'sum signed halfword pairs into words, saturating'], ['vsum2sws', 1672, 'sum signed word pairs, saturating'], ['vsumsws', 1928, 'sum all signed words, saturating'],
        ['vaddfp', 10, 'add as single-precision floats'], ['vsubfp', 74, 'subtract as single-precision floats'],
        ['vmaxfp', 1034, 'maximum of single-precision floats'], ['vminfp', 1098, 'minimum of single-precision floats'],
    ];
    for (const [name, xo, d] of VX3)
        push(name, vx3(name, xo), 'typeVREG3', [0x15, 0x10, 0x0B], [0x00, 0x01, 0x02], `Vector ${cap(d.split(',')[0])} (${name})`, `Per-element: ${d}, of vA and vB into vD.`, `${name} v0, v1, v2`);

    // VX2: unary vD, vB
    const VX2 = [
        ['vupkhsb', 526, 'unpack the high signed bytes to halfwords'], ['vupkhsh', 590, 'unpack the high signed halfwords to words'],
        ['vupklsb', 654, 'unpack the low signed bytes to halfwords'], ['vupklsh', 718, 'unpack the low signed halfwords to words'],
        ['vupkhpx', 846, 'unpack the high 1-5-5-5 pixels to words'], ['vupklpx', 974, 'unpack the low 1-5-5-5 pixels to words'],
        ['vrefp', 266, 'reciprocal estimate of each float'], ['vrsqrtefp', 330, 'reciprocal square-root estimate of each float'],
        ['vexptefp', 394, '2^x estimate of each float'], ['vlogefp', 458, 'log2 estimate of each float'],
        ['vrfin', 522, 'round each float to nearest'], ['vrfiz', 586, 'round each float toward zero'],
        ['vrfip', 650, 'round each float toward +inf'], ['vrfim', 714, 'round each float toward -inf'],
    ];
    for (const [name, xo, d] of VX2)
        push(name, vx3(name, xo), 'typeVREG3', [0x15, 0x0B], [0x00, 0x01], `Vector ${cap(d.split(' ')[0])} (${name})`, `${cap(d)}, from vB into vD.`, `${name} v0, v1`);

    // VA4: vD, vA, vB, vC
    const VA4 = [
        ['vmhaddshs', 32, 'multiply-high-add signed halfwords, saturating'], ['vmhraddshs', 33, 'multiply-high-round-add signed halfwords, saturating'],
        ['vmladduhm', 34, 'multiply-low-add unsigned halfwords, modulo'], ['vmsumubm', 36, 'multiply-sum unsigned bytes, modulo'],
        ['vmsummbm', 37, 'multiply-sum mixed-sign bytes, modulo'], ['vmsumuhm', 38, 'multiply-sum unsigned halfwords, modulo'],
        ['vmsumuhs', 39, 'multiply-sum unsigned halfwords, saturating'], ['vmsumshm', 40, 'multiply-sum signed halfwords, modulo'],
        ['vmsumshs', 41, 'multiply-sum signed halfwords, saturating'], ['vsel', 42, 'bitwise select from vA or vB per bit of vC'],
        ['vperm', 43, 'permute bytes of vA:vB by the indices in vC'], ['vmaddfp', 46, 'fused multiply-add of floats: vA*vC + vB'],
        ['vnmsubfp', 47, 'negative fused multiply-sub of floats: -(vA*vC - vB)'],
    ];
    for (const [name, xo, d] of VA4) {
        // vmaddfp/vnmsubfp use assembly order vD,vA,vC,vB (op is vA*vC +/- vB);
        // every integer multiply-sum op uses vD,vA,vB,vC.
        const fma = name === 'vmaddfp' || name === 'vnmsubfp';
        const order = fma ? [0x00, 0x01, 0x03, 0x02] : [0x00, 0x01, 0x02, 0x03];
        push(name, (OP4 | xo) >>> 0, 'typeVREG4', [0x15, 0x10, 0x0B, 0x06], order, `Vector ${cap(d.split(',')[0])} (${name})`, `Per-element ${d}, into vD.`, `${name} v0, v1, v2, v3`);
    }

    // VXI: trailing 5-bit immediate. splats + fp/int converts + vsldoi
    push('vspltisb', (OP4 | 780) >>> 0, 'typeVX5', [0x15, 0x10], [0x00, 0x01], 'Vector Splat Immediate Signed Byte (vspltisb)', 'Splats the signed 5-bit immediate into every byte of vD.', 'vspltisb v0, 1');
    push('vspltish', (OP4 | 844) >>> 0, 'typeVX5', [0x15, 0x10], [0x00, 0x01], 'Vector Splat Immediate Signed Halfword (vspltish)', 'Splats the signed 5-bit immediate into every halfword of vD.', 'vspltish v0, 1');
    push('vspltisw', (OP4 | 908) >>> 0, 'typeVX5', [0x15, 0x10], [0x00, 0x01], 'Vector Splat Immediate Signed Word (vspltisw)', 'Splats the signed 5-bit immediate into every word of vD.', 'vspltisw v0, 1');
    push('vspltb', (OP4 | 524) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Splat Byte (vspltb)', 'Splats byte element UIMM of vB into every byte of vD.', 'vspltb v0, v1, 3');
    push('vsplth', (OP4 | 588) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Splat Halfword (vsplth)', 'Splats halfword element UIMM of vB into every halfword of vD.', 'vsplth v0, v1, 3');
    push('vspltw', (OP4 | 652) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Splat Word (vspltw)', 'Splats word element UIMM of vB into every word of vD.', 'vspltw v0, v1, 3');
    push('vcfux', (OP4 | 778) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Convert Unsigned Fixed to Float (vcfux)', 'Converts each unsigned word of vB to float, dividing by 2^UIMM.', 'vcfux v0, v1, 0');
    push('vcfsx', (OP4 | 842) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Convert Signed Fixed to Float (vcfsx)', 'Converts each signed word of vB to float, dividing by 2^UIMM.', 'vcfsx v0, v1, 0');
    push('vctuxs', (OP4 | 906) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Convert Float to Unsigned Fixed Saturating (vctuxs)', 'Multiplies each float of vB by 2^UIMM and converts to unsigned word, saturating.', 'vctuxs v0, v1, 0');
    push('vctsxs', (OP4 | 970) >>> 0, 'typeVX5', [0x15, 0x0B, 0x10], [0x00, 0x01, 0x02], 'Vector Convert Float to Signed Fixed Saturating (vctsxs)', 'Multiplies each float of vB by 2^UIMM and converts to signed word, saturating.', 'vctsxs v0, v1, 0');
    push('vsldoi', (OP4 | 44) >>> 0, 'typeVX5', [0x15, 0x10, 0x0B, 0x06], [0x00, 0x01, 0x02, 0x03], 'Vector Shift Left Double by Octet Immediate (vsldoi)', 'Concatenates vA:vB and takes the 16 bytes starting at octet SHB into vD.', 'vsldoi v0, v1, v2, 4');

    // VC: compares, plain + dot (Rc) forms. dot updates cr6.
    const VC = [
        ['vcmpequb', 6, 'equal, unsigned bytes'], ['vcmpequh', 70, 'equal, unsigned halfwords'], ['vcmpequw', 134, 'equal, unsigned words'],
        ['vcmpeqfp', 198, 'equal, floats'], ['vcmpgefp', 454, 'greater-or-equal, floats'],
        ['vcmpgtub', 518, 'greater-than, unsigned bytes'], ['vcmpgtuh', 582, 'greater-than, unsigned halfwords'], ['vcmpgtuw', 646, 'greater-than, unsigned words'],
        ['vcmpgtfp', 710, 'greater-than, floats'], ['vcmpgtsb', 774, 'greater-than, signed bytes'], ['vcmpgtsh', 838, 'greater-than, signed halfwords'],
        ['vcmpgtsw', 902, 'greater-than, signed words'], ['vcmpbfp', 966, 'bounds check, floats'],
    ];
    for (const [name, xo, d] of VC) {
        push(name, (OP4 | xo) >>> 0, 'typeVREG3', [0x15, 0x10, 0x0B], [0x00, 0x01, 0x02], `Vector Compare ${cap(d.split(',')[0])} (${name})`, `Per-element compare (${d}) of vA and vB, all-ones or all-zeros into vD.`, `${name} v0, v1, v2`);
        push(name + '.', (OP4 | xo | 0x400) >>> 0, 'typeVREG3', [0x15, 0x10, 0x0B], [0x00, 0x01, 0x02], `Vector Compare ${cap(d.split(',')[0])} and Record (${name}.)`, `Like ${name} but also records the all-true / all-false summary in cr6.`, `${name}. v0, v1, v2`);
    }

    // VX1: move vector status/control register
    push('mfvscr', (OP4 | 1540) >>> 0, 'typeVREG3', [0x15], [0x00], 'Move From Vector Status and Control Register (mfvscr)', 'Copies the VSCR into vD.', 'mfvscr v0');
    push('mtvscr', (OP4 | 1604) >>> 0, 'typeVREG3', [0x0B], [0x00], 'Move To Vector Status and Control Register (mtvscr)', 'Copies vB into the VSCR.', 'mtvscr v0');

    return out;
}

const INSTRUCTIONS = withBranchHints(withRegBranches(withRcOeForms(BASE.concat(EXTRA, altivecOps()))));

function byName() {
    const m = new Map();
    for (const ins of INSTRUCTIONS) {
        const k = ins.name.toLowerCase();
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(ins);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order.length - b.order.length);
    return m;
}

module.exports = {
    INSTRUCTIONS,
    byName
};