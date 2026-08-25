/**
 * Inert stand-in for `graceful-fs` inside the dep prebundle (roadmap 087).
 *
 * find-packages (npm extraction) pulls graceful-fs, which PATCHES the fs
 * module at require time — including probing it with a Symbol key, which
 * Vite's browser-external fs facade cannot even answer (its warning template
 * stringifies the key and throws). Single-file extraction never touches a real
 * filesystem, so the honest browser answer is a module with nothing in it:
 * loading succeeds, and any actual fs call fails loudly as an undefined
 * property.
 */
module.exports = {};
