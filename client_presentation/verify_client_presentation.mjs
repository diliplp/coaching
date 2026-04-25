import path from "node:path";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const file = path.resolve("client_presentation/outputs/gujarat-tuition-exam-portal-client-presentation.pptx");
const blob = await FileBlob.load(file);
const presentation = await PresentationFile.importPptx(blob);

console.log(`slides=${presentation.slides.count}`);
