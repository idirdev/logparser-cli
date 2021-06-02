# logparser-cli

> **[EN]** Parse, filter, and analyze log files from the terminal — supports JSON logs, plain-text timestamped logs, and auto-detection. Filter by level, grep by text, or get instant statistics.
> **[FR]** Parsez, filtrez et analysez des fichiers de logs depuis le terminal — prend en charge les logs JSON, les logs texte horodatés et l'auto-détection. Filtrez par niveau, recherchez du texte ou obtenez des statistiques instantanées.

---

## Features / Fonctionnalités

**[EN]**
- Parses JSON log lines (supports `timestamp`/`time`/`ts`, `level`/`severity`, `message`/`msg` fields)
- Parses plain-text timestamped logs (ISO 8601 prefix + optional level bracket)
- Auto-detection mode: tries JSON first, falls back to plain-text per line
- Filter entries by log level (`--level ERROR`)
- Full-text search across raw log lines (`--grep "timeout"`)
- Date range filtering with `--from` and `--to` (ISO timestamp strings)
- Statistics mode (`--stats`): total lines, per-level counts, error rate percentage
- Fully programmatic API: parse files, filter entries, compute stats in code

**[FR]**
- Parse les lignes de log JSON (prend en charge les champs `timestamp`/`time`/`ts`, `level`/`severity`, `message`/`msg`)
- Parse les logs texte horodatés (préfixe ISO 8601 + bracket de niveau optionnel)
- Mode auto-détection : essaie JSON d'abord, puis texte brut par ligne
- Filtre les entrées par niveau de log (`--level ERROR`)
- Recherche texte intégrale dans les lignes brutes (`--grep "timeout"`)
- Filtrage par plage de dates avec `--from` et `--to` (chaînes timestamp ISO)
- Mode statistiques (`--stats`) : total des lignes, comptage par niveau, taux d'erreur en pourcentage
- API entièrement programmable : parser des fichiers, filtrer, calculer des stats dans le code

---

## Installation

```bash
npm install -g @idirdev/logparser-cli
```

---

## CLI Usage / Utilisation CLI

```bash
# Parse and print all entries (parser et afficher toutes les entrées)
logparser-cli app.log

# Filter by level (filtrer par niveau)
logparser-cli app.log --level ERROR

# Search for a keyword (rechercher un mot-clé)
logparser-cli app.log --grep "database"

# Combine level filter and grep (combiner filtre niveau et recherche)
logparser-cli app.log --level WARN --grep "timeout"

# Show statistics (afficher les statistiques)
logparser-cli app.log --stats

# Specify log format explicitly (spécifier le format explicitement)
logparser-cli app.log --format json
logparser-cli app.log --format plain

# Show help (afficher l'aide)
logparser-cli --help
```

### Example Output / Exemple de sortie

```
$ logparser-cli app.log --stats
Total: 2847
Error rate: 3.21%
  INFO: 2104
  WARN: 631
  ERROR: 91
  DEBUG: 21

$ logparser-cli app.log --level ERROR
2024-01-15T10:23:11Z ERROR Database connection refused: ECONNREFUSED 127.0.0.1:5432
2024-01-15T10:24:03Z ERROR Request timeout after 30000ms on POST /api/users
2024-01-15T11:02:44Z ERROR Unhandled promise rejection: Cannot read property 'id' of undefined
```

---

## API (Programmatic) / API (Programmation)

```js
const { parseLine, parseFile, filterEntries, stats } = require('@idirdev/logparser-cli');

// Parse a single log line (parser une ligne de log unique)
const entry = parseLine('2024-01-15T10:23:11Z [ERROR] Database connection refused', 'plain');
// { timestamp: '2024-01-15T10:23:11Z', level: 'ERROR', message: 'Database connection refused', ... }

// Parse a JSON log line (parser une ligne de log JSON)
const jsonEntry = parseLine('{"ts":"2024-01-15T10:23:11Z","severity":"warn","msg":"Retrying..."}', 'json');

// Parse an entire log file (parser un fichier de log entier)
const entries = parseFile('./logs/app.log', { format: 'auto' });
console.log(entries.length); // total parsed lines

// Filter entries (filtrer les entrées)
const errors = filterEntries(entries, { level: 'ERROR' });
const dbIssues = filterEntries(entries, { grep: 'database' });
const ranged = filterEntries(entries, {
  from: '2024-01-15T00:00:00Z',
  to: '2024-01-15T12:00:00Z'
});

// Get statistics (obtenir les statistiques)
const s = stats(entries);
console.log(s.total);      // 2847
console.log(s.errorRate);  // 3.21
console.log(s.levels);     // { INFO: 2104, WARN: 631, ERROR: 91, DEBUG: 21 }
```

---

## License

MIT © idirdev
