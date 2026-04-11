import { nextConfig } from "eslint-config-next/flat";
import base from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export default [...base, ...nextConfig];
