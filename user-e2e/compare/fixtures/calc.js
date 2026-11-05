function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

module.exports = { add, multiply };

console.log('add(2,3) =', add(2, 3));
console.log('multiply(4,5) =', multiply(4, 5));
