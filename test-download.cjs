const fs = require("fs");
async function test() {
  const url =
    "https://drive.google.com/uc?export=download&id=1uEYebr_sHM_x2wJLUX50hNfXfF5M1HPI&t=" +
    Date.now();
  console.log("Fetching", url);
  const res = await fetch(url, { cache: "no-store" });
  console.log("Status:", res.status);
  const headers = Array.from(res.headers.entries());
  console.log("Headers:", headers);
}
test();
