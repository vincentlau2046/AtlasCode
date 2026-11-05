---
name: summarize-numbers
description: Sum the numbers in a JSON file and report the total.
when-to-use: When the user asks to sum or total the numbers in a data file.
---

# summarize-numbers

1. Read the target JSON file.
2. Find the `values` array (or any array of numbers).
3. Compute the sum.
4. Reply with: "The total is <N> (over <k> values)."
