# Procédure de test grandeur nature — Signature électronique Fiche Produit

_Dernière mise à jour : 22/07/2026_

Cette procédure permet de tester le circuit complet (Dépôt → Décision → PDF final) comme si vous découvriez l'outil. Prévoir 15-20 minutes, et idéalement 2 personnes (vous + un collègue qui joue le rôle de validateur), ou vous-même en double compte si vous êtes seul.

## 0. Avant de commencer

Ouvrir ces 3 documents dans des onglets séparés (accès Google Drive requis) :

- **Formulaire 1 — Dépôt** : formulaire de soumission d'une fiche produit
- **Google Sheet "Validation_Fiche_Produit"**, onglet **Tracker** : c'est le tableau de bord qui montre l'état de chaque validation
- Le même Sheet, onglet **Logs** : utile en cas de souci pour voir ce que le script a fait

Vérifier que l'onglet **Config_Signataires** contient bien une ligne `TEST` avec votre propre adresse email comme validateur — c'est le processus prévu pour tester sans solliciter les vrais signataires métier (Hervé, Mathieu, Alexandre, etc.).

## 1. Déposer une fiche produit (Formulaire 1)

Remplir le Formulaire 1 avec des données clairement identifiables comme test :

| Champ | Valeur suggérée |
|---|---|
| Adresse e-mail | la vôtre |
| Référence produit | un nom inventé, ex. `TESTDEMO01` |
| Numéro de révision | `001` |
| Nom du client | `TEST` |
| Processus modifiés | `TEST` (uniquement, pour ne solliciter que vous) |
| Fichier source (.docx) | un document Word type fiche produit (le gabarit habituel) |
| Sous-traitance | `Non` |

Valider l'envoi.

## 2. Vérifier que le dépôt a bien été traité

Dans l'onglet **Logs**, une nouvelle série de lignes doit apparaître avec :
- `Début surNouvelleDemande`
- `[OK] Google Doc créé : ...`
- `Ajout tracker : FOR-PRO-TESTDEMO01-REV001 | Proc: TEST | ...`
- `E-mail envoyé à ...`

Si une ligne `[ERREUR]` apparaît à la place, arrêter ici et regarder le message d'erreur avant de continuer.

Dans l'onglet **Tracker**, une nouvelle ligne doit être apparue :
- `Ref_Doc` = `FOR-PRO-TESTDEMO01-REV001`
- `Statut` = `EN_ATTENTE`
- `Validateur_Email` = votre adresse

## 3. Recevoir et traiter la demande de décision

Un e-mail arrive avec pour objet `[VALIDATION REQUISE] FOR-PRO-TESTDEMO01-REV001 — Client : TEST`.

Il contient :
- un lien vers le document à consulter
- **un bouton par processus** à traiter (ici un seul, "TEST", puisque c'est le seul processus soumis)

Cliquer sur le bouton **"Rendre ma décision"** en face du processus TEST. Cela ouvre le **Formulaire 2 (Décision)**, avec l'identifiant de signature déjà pré-rempli (ne pas le modifier).

Dans le formulaire, remplir :
- **Processus** : sélectionner `TEST` (doit correspondre au bouton cliqué)
- **Votre décision** : `J'approuve` (pour un premier test réussi) — ou `Je refuse` avec un motif, si vous voulez tester le circuit de refus

Valider l'envoi.

## 4. Vérifier que la décision a bien été traitée

Dans l'onglet **Logs** :
- `Début surDecision`
- `Signature trouvée sur la ligne ... pour le document FOR-PRO-TESTDEMO01-REV001`
- `Signature écrite dans le document pour le processus : TEST`
- Si tous les processus sont validés : `Tous les processus de FOR-PRO-TESTDEMO01-REV001 sont finalisés — génération du PDF.`
- `PDF déposé avec succès : [lien Drive]`

Dans l'onglet **Tracker**, la ligne doit maintenant afficher :
- `Statut` = `APPROUVÉ`
- `Date_Validation` = aujourd'hui

## 5. Vérifier les livrables finaux

- **Le document Google Doc** (lien reçu à l'étape 3) : le tableau "Historique des révisions" doit contenir une ligne avec votre email et l'identifiant de signature.
- **Un e-mail de confirmation** doit arriver dans votre boîte : `[VALIDÉ ✓] FOR-PRO-TESTDEMO01-REV001 — Tous les processus approuvés`, avec un lien vers le PDF final.
- **Un PDF** doit être déposé dans le dossier Sylob, sous-dossier client `TEST` (à créer automatiquement s'il n'existe pas).
- **Sandrine Guillemin** doit recevoir un mail `[PROD VALIDÉ ✓]` uniquement à ce moment précis (une fois tout signé) — pas avant.

## 6. Tester un cas à plusieurs validateurs (optionnel, recommandé)

Pour se rapprocher d'un cas réel, refaire l'étape 1 avec :
- **Processus modifiés** : `DECOUPE LASER, USINAGE` (par exemple)

Chaque processus a plusieurs validateurs configurés dans `Config_Signataires` — chacun recevra un e-mail avec un bouton par processus qui le concerne. Vérifier notamment que :
- chaque validateur ne voit que ses propres processus
- le document n'est marqué "finalisé" (PDF généré) que lorsque **tous** les validateurs de **tous** les processus ont approuvé
- si un validateur refuse un processus, seul lui reçoit une nouvelle demande après correction — pas les autres qui ont déjà validé

## 7. Nettoyer après le test

Dans l'onglet **Tracker**, repérer les lignes créées pendant le test (`Ref_Doc` commençant par `FOR-PRO-TESTDEMO01`) et soit :
- les laisser (elles ne gênent pas le fonctionnement, juste la lisibilité), soit
- passer leur `Statut` à `ANNULÉ` manuellement pour garder le tableau propre.

## En cas de blocage

- **Rien ne se passe après l'envoi du Formulaire 1** : vérifier l'onglet Logs pour une ligne `[ERREUR]`. Le cas le plus fréquent est un problème sur l'URL du fichier déposé.
- **Le bouton du mail ne pré-remplit rien** : vérifier que l'identifiant de signature apparaît bien dans l'URL du lien (paramètre après `?usp=pp_url&entry...=`).
- **Le document n'est jamais marqué finalisé** : dans le Tracker, vérifier qu'aucune ligne du même `Ref_Doc` n'est encore `EN_ATTENTE` ou `REFUSÉ`.
