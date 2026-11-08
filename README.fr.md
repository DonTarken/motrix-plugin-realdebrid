# Solveur Real-Debrid pour Motrix

Extension open-source pour le gestionnaire de téléchargement [Motrix](https://motrix.app) permettant de débrider automatiquement les liens d'hébergeurs (1fichier, Rapidgator, Mega, Turbobit, etc.) via l'API officielle de Real-Debrid.

[![Dernière version](https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Version&color=blue)](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest)
[![Compatibilité Motrix](https://img.shields.io/badge/Motrix->=%202.0.0-orange)](https://motrix.app)
[![Licence MIT](https://img.shields.io/badge/Licence-MIT-blue.svg)](LICENSE)
[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/DonTarken)
[![Ko-fi](https://img.shields.io/badge/Soutenir-Ko--fi-F16061?logo=ko-fi&logoColor=white)](https://ko-fi.com/dontarken)

**Français** | [English](README.md)

---

## Fonctionnalités

Lorsque vous ajoutez un lien d'hébergeur pris en charge dans Motrix, le plugin intercepte l'URL, récupère le lien de téléchargement direct auprès de votre compte Real-Debrid et le transmet directement au moteur Aria2.

- **Débridage automatique** : Les liens sont convertis lors de l'ajout dans Motrix, sans avoir à les copier-coller manuellement sur le site de Real-Debrid.
- **Intégration directe avec Aria2** : Téléchargement multi-connexions avec reprise sur coupure réseau.
- **Cache local des hébergeurs** : La liste des domaines supportés est mise en cache localement afin de limiter les requêtes inutiles à l'API.
- **Sécurité** : Votre jeton d'API est stocké localement dans Motrix et n'est transmis qu'à l'API officielle de Real-Debrid.

---

## Installation

### Méthode 1 : Directement depuis Motrix
1. Ouvrez l'onglet **Extensions** dans Motrix.
2. Cliquez sur le bouton d'ajout (`+`).
3. Saisissez :
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
4. Validez l'installation.

### Méthode 2 : Fichier `.moext` manuel
1. Téléchargez le fichier `realdebrid-resolver.moext` depuis la page des [Releases](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest).
2. Glissez-déposez le fichier `.moext` sur la fenêtre de Motrix pour lancer l'installation.

---

## Configuration

1. Récupérez votre jeton d'API sur [real-debrid.com/apitoken](https://real-debrid.com/apitoken).
2. Dans Motrix, ouvrez **Extensions** -> **Real-Debrid Resolver** -> **Paramètres**.
3. Collez votre jeton dans le champ prévu et sauvegardez.
4. Ajoutez vos liens de téléchargement habituels dans Motrix.

---

## Compatibilité multi-résolveurs

Ce plugin a été conçu pour cohabiter proprement avec [motrix-plugin-alldebrid](https://github.com/DonTarken/motrix-plugin-alldebrid). Si les deux extensions sont actives en même temps, un lien déjà débridé par l'un est ignoré par l'autre, ce qui permet une bascule automatique selon la disponibilité des hébergeurs.

---

## Retours et signalements

- [Signaler un bug](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=bug_report.yml)
- [Confirmer un test et partager son débit](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=test_confirmation.yml)
- [Proposer une amélioration](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=feature_request.yml)
- [Fil de discussion pour les testeurs](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/1)

---

## Licence

Distribué sous licence MIT. Consultez le fichier [LICENSE](LICENSE) pour plus de détails.
