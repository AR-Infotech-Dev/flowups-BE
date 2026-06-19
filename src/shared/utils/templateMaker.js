import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import Handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const renderTemplate = async (name, type, data = {}) => {
    const folderMap = {
        email: "emails",
        excel: "excels",
    };
    const extensionMap = {
        email: ".email.hbs",
        excel: ".excel.hbs",
    };
    const templatePath = path.join(
        __dirname,
    "../../templates",
        folderMap[type],
        `${name}${extensionMap[type]}`
    );
    const source = await fs.readFile(templatePath, "utf8");
    const template = Handlebars.compile(source);
    return template(data);
}
