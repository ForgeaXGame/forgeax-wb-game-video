// @source wb-character/src/shared/CharacterDesign.ts
// Minimal re-declaration for wb-anim — only the loadSelectedConcept function
// (used by the video pipeline) and its IDB helpers are included.

const IDB_NAME = 'ce-hist-img'
const IDB_STORE = 'full'
const SELECTED_CONCEPT_KEY = 'ce-selected-concept'

let _db: IDBDatabase | null = null

function getDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => { _db = req.result; resolve(_db) }
    req.onerror = () => reject(req.error)
  })
}

async function idbLoad(id: string): Promise<string | null> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(id)
    req.onsuccess = () => resolve((req.result as string) ?? null)
    req.onerror = () => reject(req.error)
  })
}

/** Load the selected concept art from IDB. Returns null if none stored. */
export async function loadSelectedConcept(): Promise<string | null> {
  try { return await idbLoad(SELECTED_CONCEPT_KEY) } catch { return null }
}
