import { readFile } from 'node:fs/promises';
/** Keep the offline output to one file, with no external script or network dependency. */
export async function presentationHtml(pack) {
  const template = await readFile('presentation/index.html', 'utf8');
  const script = await readFile('presentation/app.js', 'utf8');
  const embedded = JSON.stringify(pack).replace(/</g, () => String.fromCharCode(92) + 'u003c');
  return template
    .replace('__CAPTURED_PACK__', () => embedded)
    .replace(
      '<script src="./app.js"></script>',
      () => '<script>' + script.replace(/<\/script/gi, '<\\/script') + '</script>',
    );
}
