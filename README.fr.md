# Plugin Real-Debrid pour Motrix

<p align="center">
  <img src="assets/realdebrid-logo.png" alt="Real-Debrid Logo" height="38" />
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <img src="assets/motrix-logo.png" alt="Motrix Logo" height="38" />
</p>

<p align="center">
  <a href="https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest"><img src="https://img.shields.io/github/v/release/DonTarken/motrix-plugin-realdebrid?label=Derni%C3%A8re%20version&color=success&style=for-the-badge" alt="Dernière version" /></a>
  <a href="https://motrix.app"><img src="https://img.shields.io/badge/Motrix-%3E%3D%202.0.0-orange?style=for-the-badge" alt="Motrix 2.0+" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licence-MIT-blue?style=for-the-badge" alt="Licence MIT" /></a>
  <a href="https://github.com/sponsors/DonTarken"><img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsoriser sur GitHub" /></a>
  <a href="https://ko-fi.com/dontarken"><img src="https://img.shields.io/badge/Ko--fi-Soutenir%20le%20projet-F16061?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Soutenir sur Ko-fi" /></a>
</p>

<p align="center">
  🇫🇷 <b>Français</b> &nbsp;|&nbsp; <a href="README.md">🇬🇧 English</a>
</p>

---

## Pourquoi ce plugin ?

Vous utilisez **Motrix** comme gestionnaire de téléchargement et vous possédez un compte premium **Real-Debrid** ?

Ce plugin officiel autonome (`.moext`) transforme Motrix en une alternative moderne, ultra-rapide et légère à **JDownloader** :
- **Débridage 100% automatique** : collez vos liens (1fichier, Rapidgator, Turbobit, Mega, Katfile, etc.), Motrix les débride et lance le téléchargement immédiatement via l'API REST officielle Real-Debrid v1.0.
- **Configuration simple par Token API** : un simple copier-coller de votre token API Real-Debrid dans les paramètres de l'extension et le tour est joué.
- **Vitesse maximale** : sature votre connexion (jusqu'à 100+ Mo/s sur fibre) grâce au moteur multi-connexions Aria2.
- **Compatibilité multi-résolveurs** : Conçu pour cohabiter proprement avec [motrix-plugin-alldebrid](https://github.com/DonTarken/motrix-plugin-alldebrid) sans aucun conflit.
- **Testé & Robuste** : Suite complète de 15 tests unitaires automatisés validant la sécurité fail-closed, l'authentification Bearer et la résilience réseau.

---

## 🚀 Tutoriel d'Installation Rapide

### Étape 1 : Installer l'extension dans Motrix (au choix)

#### Méthode A : Directement via GitHub (Recommandée — la plus simple)
1. Ouvrez **Motrix** et cliquez sur l'onglet **« Extensions »** dans la barre latérale gauche (icône 📦 sous *Trackers*).
2. Cliquez sur le bouton **`+`** tout en haut à droite pour ouvrir la fenêtre *« Ajouter une extension »*.
3. Dans le champ, saisissez simplement le nom du dépôt :
   ```text
   DonTarken/motrix-plugin-realdebrid
   ```
   *(Le badge en-dessous indiquera **`Type détecté : GitHub`** — ne mettez pas `https://` devant pour que Motrix interroge directement les releases GitHub).*
4. Cliquez sur la loupe 🔍 en bas à droite (ou appuyez sur Entrée). Motrix téléchargera automatiquement la release officielle et vous demandera de confirmer l'installation !

---

#### 📁 Méthode B : Via le fichier `.moext` local
1. 👉 **[Télécharger `realdebrid-resolver.moext`](https://github.com/DonTarken/motrix-plugin-realdebrid/releases/latest/download/realdebrid-resolver.moext)** (dernière version).
2. Dans Motrix ➔ onglet **Extensions** ➔ cliquez sur le bouton **`+`** en haut à droite.
3. **Glissez-déposez** le fichier téléchargé directement dans le champ, ou cliquez sur le trombone 📎 pour le sélectionner sur votre disque.
4. Confirmez l'installation.

---

### Étape 2 : Renseigner votre Token API Real-Debrid
1. Sur la page **Extensions**, repérez la carte **Real-Debrid Resolver** et cliquez sur le bouton **« Ouvrir »**.
2. Récupérez votre token API personnel sur votre compte Real-Debrid : **[real-debrid.com/apitoken](https://real-debrid.com/apitoken)**.
3. Collez votre token dans le champ **Token API Real-Debrid** et sauvegardez.
4. Une notification vous confirme que votre **statut Premium est actif** avec vos jours restants. Vous êtes prêt à télécharger ! 🎉

---

## 💡 Utilisation au Quotidien

* **Téléchargement unique :** Copiez n'importe quel lien hébergeur et collez-le dans Motrix (`Ctrl + N` ou bouton `+`).
* **Téléchargements par lot :** Collez 10, 20 ou 50 liens d'archives découpées (`.part01.rar`, `.part02.rar`...) ; tous les liens sont débridés et mis en file d'attente en parallèle.
* **Extension de navigateur :** Utilisez l'extension Chrome ou Firefox de Motrix pour faire un clic droit **« Télécharger avec Motrix »** sur n'importe quel lien du web.

---

## ❓ FAQ & Dépannage

<details>
<summary><b>Ma vitesse oscille ou la barre reste bloquée à 0 o/s ?</b></summary>
<br>

Si vous téléchargez de très gros fichiers (ex : vidéos de 20 à 60 Go), vérifiez où Motrix écrit :
- **Privilégiez un SSD (SATA ou NVMe)** plutôt qu'un disque dur mécanique 5400 tr/min.
- Sur un disque dur lent, l'allocation d'espace pour un fichier de 50 Go peut saturer les files d'attente Windows pendant plusieurs minutes.
- Sur SSD, l'espace est alloué instantanément et la vitesse grimpe immédiatement à 90–115 Mo/s sur fibre gigabit.
</details>

<details>
<summary><b>Quels hébergeurs sont supportés ?</b></summary>
<br>

Tous les hébergeurs pris en charge par votre abonnement Real-Debrid : 1fichier, Rapidgator, Turbobit, Mega, Katfile, DDownload, Uptobox, Filefactory, Nitroflare, etc. Le plugin met à jour la liste des domaines supportés toutes les heures.
</details>

<details>
<summary><b>Mes identifiants sont-ils en sécurité ?</b></summary>
<br>

**À 100 %.** Le plugin ne demande ni n'accède jamais à votre mot de passe Real-Debrid. Votre token API est stocké localement sur votre machine dans les données sécurisées de Motrix et n'est transmis qu'aux serveurs officiels de Real-Debrid via un en-tête `Authorization: Bearer`.
</details>

---

## 🐛 Retours, Tests & Signalements

Vous rencontrez un problème ou souhaitez confirmer vos débits ?

* 👉 **[Fil de discussion pour les testeurs](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/1)** : Partagez vos retours et confirmez vos vitesses de téléchargement.
* 👉 **[Confirmer un test de débit](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=test_confirmation.yml)** : Aidez à valider les performances en conditions réelles avec votre compte.
* 👉 **[Signaler un bug](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=bug_report.yml)** : Si un lien refuse de se débrider ou en cas de comportement inattendu.
* 👉 **[Proposer une amélioration](https://github.com/DonTarken/motrix-plugin-realdebrid/issues/new?template=feature_request.yml)** : Proposez vos idées pour les futures versions.

---

## 🛠️ Compilation depuis les sources (Développeurs)

```bash
# Cloner le dépôt
git clone https://github.com/DonTarken/motrix-plugin-realdebrid.git
cd motrix-plugin-realdebrid

# Lancer la suite de 15 tests unitaires
npm test

# Compiler le paquet .moext
npm run build
```

L'archive compilée sera enregistrée dans `dist/realdebrid-resolver.moext`.

---

## 💖 Soutenir le Projet

Si ce plugin vous fait gagner du temps et accélère vos téléchargements, pensez à soutenir son développement. Chaque café compte ! ☕

<p align="center">
  <a href="https://ko-fi.com/dontarken" target="_blank">
    <img src="https://storage.ko-fi.com/cdn/kofi3.png?v=3" height="40" alt="Buy Me a Coffee at ko-fi.com" />
  </a>
</p>

---

## 📄 Licence

Open-source sous licence **[MIT](LICENSE)**.  
Développé avec passion par **[DonTarken](https://github.com/DonTarken)**.
