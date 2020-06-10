const a = {};

const b = { a: 1, b: 2 };
c = b;
a["b"] = b;

const d = a["b"];
console.log(b);
console.log(a["b"]);
console.log(c);
console.log(d);

b.a = 9;

console.log(b);
console.log(a["b"]);
console.log(c);
console.log(d);

delete a["b"];
console.log(b);
console.log(a["b"]);
console.log(c);
console.log(d);
