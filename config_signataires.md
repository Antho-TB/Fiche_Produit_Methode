# Config Sheet — Signataires par Processus

## Nom du Google Sheet : `Config_Signataires`
## Nom de l'onglet   : `Config_Signataires`

---

## Structure du tableau (Colonne A + Colonne B)

| PROCESSUS (col A) | EMAILS_SIGNATAIRES (col B — séparés par des virgules) |
|---|---|
| DECOUPE LASER | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| DECOUPE TRADITIONNELLE | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, t.roddier@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| USINAGE | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, s.tarrerias@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| MEULAGE | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| MEULAGE DOS | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| TAILLAGE | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, p.bernard@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| MONTAGE | t.roddier@tb-groupe.fr, r.printemps@tb-groupe.fr, a.devaux@tb-groupe.fr |
| PLASTURGIE | m.obert@tb-groupe.fr |
| CLOUAGE | m.obert@tb-groupe.fr |
| MARQUAGE | h.megnien@tb-groupe.fr, m.berard@tb-groupe.fr, j.tadeu@tb-groupe.fr, a.devaux@tb-groupe.fr |
| AFFILAGE | p.bernard@tb-groupe.fr |
| CONDITIONNEMENT | j.tadeu@tb-groupe.fr, a.devaux@tb-groupe.fr |

> **IMPORTANT** : Les adresses email ci-dessus sont des placeholders au format prévisible.
> Vérifier et corriger chaque adresse avec les vraies adresses avant déploiement.
> Sandrine Guillemin peut modifier directement ce Sheet à tout moment — le script
> relit la config à chaque soumission de formulaire.

---

## Règles de saisie (pour Sandrine)

- **Colonne A** : nom du processus en MAJUSCULES (doit correspondre exactement aux libellés
  du Formulaire 1 — cases à cocher)
- **Colonne B** : adresses email séparées par des virgules, sans espace superflu
- Ajouter une ligne = ajouter un nouveau processus
- Modifier la colonne B = changer les validateurs d'un processus, effectif immédiatement

---

## Structure du Google Sheet Tracker (second onglet, nom : `Tracker`)

| A : Ref_Doc | B : Client | C : Google_Doc_ID | D : Processus | E : Validateur_Email | F : Signature_ID | G : Statut | H : Date_Soumission | I : Date_Validation | J : Email_Deposant | K : Nom_Deposant |
|---|---|---|---|---|---|---|---|---|---|---|
| FOR-PRO-Comp0500070-REV007 | Client XYZ | 1HbxH7F... | USINAGE | h.megnien@tb-groupe.fr | SIG-20260528-A3F7 | APPROUVÉ | 28/05/2026 10:00 | 28/05/2026 14:23 | s.guillemin@tb-groupe.fr | Sandrine Guillemin |

Valeurs possibles colonne G (Statut) :
- `EN_ATTENTE` — en attente de réponse du validateur
- `APPROUVÉ`   — validateur a approuvé
- `REFUSÉ`     — validateur a refusé (bloque la génération PDF)
- `ANNULÉ`     — annulé automatiquement car un autre validateur a déjà approuvé ce processus

---

## Checklist de déploiement

- [ ] Créer le Google Sheet, nommer l'onglet `Config_Signataires`
- [ ] Copier le tableau ci-dessus et corriger les emails
- [ ] Créer un second onglet `Tracker` avec les en-têtes (ligne 1 : Ref_Doc, Client, Google_Doc_ID, Processus, Validateur_Email, Signature_ID, Statut, Date_Soumission, Date_Validation, Email_Deposant, Nom_Deposant)
- [ ] Copier l'ID du Sheet dans les constantes CFG des deux scripts (ID_SHEET_CONFIG + ID_SHEET_TRACKER)
- [ ] Activer le service "Drive API" (v3) dans les deux scripts (menu Services)
- [ ] Mettre à jour les noms des processus dans le Formulaire 1 (cases à cocher) pour qu'ils correspondent exactement à la colonne A de ce tableau
