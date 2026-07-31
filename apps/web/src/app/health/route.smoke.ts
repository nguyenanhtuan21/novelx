import { GET } from "./route.js";

const response = await GET();
console.log(JSON.stringify(await response.json()));
