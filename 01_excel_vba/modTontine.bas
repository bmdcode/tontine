Attribute VB_Name = "modTontine"
'=====================================================================
'  GESTIONNAIRE DE TONTINES - Module VBA pour Microsoft Excel
'  Même logique que les versions Python et PHP (schéma universel).
'
'  INSTALLATION
'   1. Ouvrir un classeur vide, l'enregistrer en .xlsm
'   2. Alt+F11 > Fichier > Importer un fichier > modTontine.bas
'   3. Alt+F8 > InstallerClasseur > Exécuter
'      (crée les feuilles, les en-têtes, les listes et les boutons)
'
'  FEUILLES DE DONNÉES (= tables du schéma universel)
'   Parametres, Membres, Groupes, Parts, Suivi_Paiements, Permutations, Remises
'  FEUILLES D'INTERFACE
'   Gestion_Groupes (tableau de 10 + permutation), Rapport_Impayes,
'   Listes_Controle
'
'  MACROS DEMANDÉES
'   Macro 1 : InscrireMembre / AttribuerMembreSelectionne
'   Macro 2 : PermuterToursSelectionnes
'   Macro 3 : RapportImpayes
'  AJOUTS v2
'   Modification d'une fiche (2e téléphone, n° CNI), TirageAuSort,
'   RemplacerTitulaire, feuille Remises (mode + référence du lot remis)
'=====================================================================
Option Explicit

Public Const F_PARAM As String = "Parametres"
Public Const F_MEMBRES As String = "Membres"
Public Const F_GROUPES As String = "Groupes"
Public Const F_PARTS As String = "Parts"
Public Const F_GESTION As String = "Gestion_Groupes"
Public Const F_SUIVI As String = "Suivi_Paiements"
Public Const F_PERM As String = "Permutations"
Public Const F_RAPPORT As String = "Rapport_Impayes"
Public Const F_LISTES As String = "Listes_Controle"
Public Const F_REMISES As String = "Remises"

Public Const NB_POS As Long = 10        ' strictement 10 tours par groupe
Public Const QUARTS_CASE As Long = 4    ' une case pleine = 4 quarts = 100 %

' Colonnes de la feuille Groupes
Private Const G_ID As Long = 1, G_CODE As Long = 2, G_MISE As Long = 3
Private Const G_TOUR As Long = 4, G_STATUT As Long = 5, G_CREA As Long = 6, G_DEBUT As Long = 7
' Colonnes de la feuille Parts
Private Const P_ID As Long = 1, P_MEMBRE As Long = 2, P_GROUPE As Long = 3
Private Const P_POS As Long = 4, P_QUARTS As Long = 5, P_DATE As Long = 6, P_NOM As Long = 7, P_CODE As Long = 8
' Colonnes de la feuille Suivi_Paiements
Private Const S_ID As Long = 1, S_PART As Long = 2, S_CODE As Long = 3, S_ECH As Long = 4, S_TOUR As Long = 5
Private Const S_NOM As Long = 6, S_TEL As Long = 7, S_PCT As Long = 8, S_MONTANT As Long = 9
Private Const S_STATUT As Long = 10, S_DATE As Long = 11
' Colonnes de la feuille Membres (H et I ajoutées en v2)
Private Const M_TEL As Long = 4, M_TEL2 As Long = 8, M_CNI As Long = 9
' Colonnes de la feuille Remises (remise du lot aux bénéficiaires)
Private Const R_ID As Long = 1, R_PART As Long = 2, R_CODE As Long = 3, R_TOUR As Long = 4, R_NOM As Long = 5
Private Const R_TEL As Long = 6, R_CNI As Long = 7, R_MONTANT As Long = 8, R_MODE As Long = 9
Private Const R_REF As Long = 10, R_DATE As Long = 11, R_OBS As Long = 12

' Interface Gestion_Groupes : C1 = code du groupe actif, tableau en lignes 5 à 14
Private Const GG_CELLULE_GROUPE As String = "C1"
Private Const GG_LIGNE1 As Long = 5

Private Const FMT_FCFA As String = "#,##0"" F"""

'=====================================================================
'  0. INSTALLATION DU CLASSEUR
'=====================================================================
Public Sub InstallerClasseur()
    Application.ScreenUpdating = False

    PreparerFeuille F_PARAM, Array("Paramètre", "Valeur")
    With Feuille(F_PARAM)
        If .Range("A2").Value = "" Then
            .Range("A2").Value = "mise_reference": .Range("B2").Value = 100000
            .Range("A3").Value = "nom_tontine": .Range("B3").Value = "Ma Tontine"
        End If
        .Range("B2").NumberFormat = FMT_FCFA
        ' Listes de choix (référencées par les validations : aucun souci de séparateur régional)
        .Range("D1:E1").Value = Array("Formule", "Quarts")
        .Range("D2:E2").Value = Array("Global - 1 part à 100 % (1 groupe)", 4)
        .Range("D3:E3").Value = Array("2 parts - 50 % dans 2 groupes", 2)
        .Range("D4:E4").Value = Array("4 parts - 25 % dans 4 groupes", 1)
        .Range("G1").Value = "Statuts"
        .Range("G2").Value = "PAYE": .Range("G3").Value = "IMPAYE"
        .Range("I1").Value = "Modes de remise"
        .Range("I2:I8").Value = Application.Transpose(Array("Espèces", "Wave", "Orange Money", "Free Money", _
                                                            "Virement bancaire", "Chèque", "Autre"))
        .Range("D1:I1").Font.Bold = True
        .Columns("A:I").AutoFit
    End With

    PreparerFeuille F_MEMBRES, Array("ID", "Nom", "Prénom", "Téléphone", "Date inscription", "Nb parts", "Engagement %", _
                                     "Téléphone 2", "N° CNI")
    With Feuille(F_MEMBRES)                       ' classeur v1 : ajouter les 2 nouvelles colonnes
        If .Range("H1").Value = "" Then .Range("H1:I1").Value = Array("Téléphone 2", "N° CNI")
        StyleEntete .Range("A1:I1")
    End With
    PreparerFeuille F_GROUPES, Array("ID", "Code", "Mise", "Tour courant", "Statut", "Date création", "Date début")
    PreparerFeuille F_PARTS, Array("ID", "ID membre", "ID groupe", "Position", "Quarts", "Date attribution", "Membre", "Groupe")
    PreparerFeuille F_SUIVI, Array("ID", "ID part", "Groupe", "Échéance", "Tour", "Membre", "Téléphone", "Part %", "Montant", "Statut", "Date paiement")
    PreparerFeuille F_PERM, Array("ID", "ID groupe", "Groupe", "Description", "Date")
    PreparerFeuille F_REMISES, Array("ID", "ID part", "Groupe", "Tour", "Bénéficiaire", "Téléphone", "N° CNI", _
                                     "Montant du lot", "Mode", "Référence", "Date remise", "Observation")
    PreparerFeuille F_GESTION, Empty
    PreparerFeuille F_RAPPORT, Empty
    PreparerFeuille F_LISTES, Empty

    ' --- Membres : zone de saisie à droite du tableau
    Dim ws As Worksheet
    Set ws = Feuille(F_MEMBRES)
    ws.Columns("D").NumberFormat = "@"           ' garde le 0 des numéros
    ws.Columns("H:I").NumberFormat = "@"
    ws.Range("J1:K20").Clear
    ws.Range("J1:K20").Validation.Delete
    ws.Range("J1").Value = "INSCRIPTION / MODIFICATION D'UN MEMBRE"
    ws.Range("J1").Font.Bold = True
    ws.Range("J2:J8").Value = Application.Transpose(Array("Nom", "Prénom", "Téléphone", "2e téléphone", "N° CNI", _
                                                          "Formule", "Fiche n°"))
    ws.Range("K2:K7").Interior.Color = RGB(255, 250, 225)
    ws.Range("K2:K8").Borders.LineStyle = xlContinuous
    ws.Range("K4:K6").NumberFormat = "@"
    ws.Range("K8").Interior.Color = RGB(235, 235, 235)
    With ws.Range("K7").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="=" & F_PARAM & "!$D$2:$D$4"
    End With
    ws.Range("K7").Value = Feuille(F_PARAM).Range("D2").Value
    ws.Columns("J").ColumnWidth = 13
    ws.Columns("K").ColumnWidth = 34
    AjouterBouton ws, ws.Range("J10"), 230, "Inscrire + attribuer la formule", "InscrireMembre"
    AjouterBouton ws, ws.Range("J12"), 230, "Attribuer la formule au membre sélectionné", "AttribuerMembreSelectionne"
    AjouterBouton ws, ws.Range("J14"), 230, "Modifier le membre sélectionné", "ChargerMembrePourModification"
    AjouterBouton ws, ws.Range("J16"), 230, "Enregistrer les modifications", "EnregistrerModificationMembre"
    ws.Range("J18").Value = "2e téléphone et CNI : facultatifs. Pour corriger une fiche : sélectionnez la ligne, " & _
                            "« Modifier », corrigez la zone jaune puis « Enregistrer »."
    ws.Range("J18").Font.Italic = True

    ' --- Remises : liste des modes et couleur « à remettre »
    Set ws = Feuille(F_REMISES)
    ws.Columns("F:G").NumberFormat = "@"
    ws.Columns("J").NumberFormat = "@"
    ws.Columns("H").NumberFormat = FMT_FCFA
    ws.Columns("K").NumberFormat = "dd/mm/yyyy"
    With ws.Range("I2:I3000").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="=" & F_PARAM & "!$I$2:$I$8"
    End With
    ws.Range("I2:I3000").FormatConditions.Delete
    With ws.Range("I2:I3000").FormatConditions.Add(Type:=xlExpression, Formula1:="=AND($A2<>"""",$I2="""")")
        .Interior.Color = RGB(255, 244, 204)
    End With
    ws.Range("N1").Value = "Une ligne est créée pour chaque bénéficiaire quand son tour s'ouvre."
    ws.Range("N2").Value = "Renseignez Mode, Référence (n° Wave, OM, chèque…) et Date : le lot est alors REMIS."
    ws.Range("N1:N2").Font.Italic = True

    ' --- Suivi des paiements : liste Payé / Impayé + couleurs
    Set ws = Feuille(F_SUIVI)
    ws.Columns("G").NumberFormat = "@"
    ws.Columns("I").NumberFormat = FMT_FCFA
    ws.Columns("K").NumberFormat = "dd/mm/yyyy"
    With ws.Range("J2:J5000").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, Formula1:="=" & F_PARAM & "!$G$2:$G$3"
    End With
    ws.Range("J2:J5000").FormatConditions.Delete
    With ws.Range("J2:J5000").FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""PAYE""")
        .Interior.Color = RGB(214, 240, 222)
    End With
    With ws.Range("J2:J5000").FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""IMPAYE""")
        .Interior.Color = RGB(250, 218, 214)
    End With
    AjouterBouton ws, ws.Range("M2"), 220, "Marquer la sélection : PAYÉ", "MarquerPaye"
    AjouterBouton ws, ws.Range("M4"), 220, "Marquer la sélection : IMPAYÉ", "MarquerImpaye"
    AjouterBouton ws, ws.Range("M6"), 220, "Afficher l'échéance en cours", "FiltrerEcheanceEnCours"
    AjouterBouton ws, ws.Range("M8"), 220, "Filtrer : impayés seulement", "FiltrerImpayes"
    AjouterBouton ws, ws.Range("M10"), 220, "Tout afficher", "ToutAfficher"
    AjouterBouton ws, ws.Range("M12"), 220, "Clôturer l'échéance du groupe actif", "CloturerEcheance"
    ws.Range("M14").Value = "Groupe actif = celui choisi dans Gestion_Groupes (cellule C1)."
    ws.Range("M14").Font.Italic = True

    ' --- Gestion des groupes : sélecteur + tableau de 10 + boutons
    Set ws = Feuille(F_GESTION)
    ws.Range("A1").Value = "Groupe :"
    ws.Range("A1").Font.Bold = True
    ws.Range("A1").Font.Size = 12
    With ws.Range(GG_CELLULE_GROUPE)
        .Interior.Color = RGB(255, 250, 225)
        .Borders.LineStyle = xlContinuous
        .Font.Bold = True
        .Font.Size = 12
        .Validation.Delete
        .Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, _
                        Formula1:="=" & F_GROUPES & "!$B$2:$B$1000"
    End With
    ws.Range("A4:E4").Value = Array("Tour", "Titulaire(s)", "Rempli", "Lot", "État")
    StyleEntete ws.Range("A4:E4")
    ws.Columns("A").ColumnWidth = 9
    ws.Columns("B").ColumnWidth = 70
    ws.Columns("C").ColumnWidth = 9
    ws.Columns("D").ColumnWidth = 14
    ws.Columns("E").ColumnWidth = 22
    AjouterBouton ws, ws.Range("G1"), 200, "Afficher le groupe", "AfficherGroupe"
    AjouterBouton ws, ws.Range("G3"), 200, "Nouveau groupe vide", "NouveauGroupe"
    AjouterBouton ws, ws.Range("G5"), 200, "Démarrer le groupe", "DemarrerGroupe"
    AjouterBouton ws, ws.Range("G8"), 200, "Permuter les tours sélectionnés", "PermuterToursSelectionnes"
    ws.Range("G10").Value = "Permutation : sélectionnez 2 lignes (A <-> B)"
    ws.Range("G11").Value = "ou 3 lignes (rotation A -> B -> C -> A)"
    ws.Range("G12").Value = "avec Ctrl + clic, puis cliquez sur le bouton."
    ws.Range("G10:G12").Font.Italic = True
    AjouterBouton ws, ws.Range("G14"), 200, "Rapport des impayés (Macro 3)", "RapportImpayes"
    AjouterBouton ws, ws.Range("G16"), 200, "Listes de contrôle", "ListesControle"
    AjouterBouton ws, ws.Range("I1"), 200, "Tirage au sort des tours", "TirageAuSort"
    AjouterBouton ws, ws.Range("I3"), 200, "Remplacer un titulaire", "RemplacerTitulaire"

    Feuille(F_GESTION).Activate
    Application.ScreenUpdating = True
    MsgBox "Classeur prêt." & vbCrLf & vbCrLf & _
           "1. Feuille Membres : saisissez Nom / Prénom / Téléphone / Formule puis « Inscrire »." & vbCrLf & _
           "2. Feuille Gestion_Groupes : choisissez un groupe, démarrez-le quand il est complet." & vbCrLf & _
           "3. Feuille Suivi_Paiements : cochez PAYE / IMPAYE et clôturez l'échéance.", vbInformation, "Tontine"
End Sub

'=====================================================================
'  MACRO 1 : INSCRIPTION ET ATTRIBUTION AUTOMATIQUE DES PARTS
'=====================================================================
Public Sub InscrireMembre()
    Dim ws As Worksheet, nom As String, prenom As String, tel As String, tel2 As String, cni As String
    Dim id As Long, r As Long, quarts As Long
    Set ws = Feuille(F_MEMBRES)
    If ws.Range("K8").Value <> "" Then
        MsgBox "Une fiche est en cours de modification (n° " & ws.Range("K8").Value & ")." & vbCrLf & _
               "Cliquez sur « Enregistrer les modifications » ou videz la cellule K8.", vbExclamation
        Exit Sub
    End If
    If Not LireFiche(0, nom, prenom, tel, tel2, cni) Then Exit Sub

    id = ProchainId(ws)
    r = DerniereLigne(ws) + 1
    ws.Cells(r, 1).Value = id
    EcrireFiche r, nom, prenom, tel, tel2, cni
    ws.Cells(r, 5).Value = Date
    ws.Cells(r, 5).NumberFormat = "dd/mm/yyyy"
    ws.Cells(r, 6).Formula = "=COUNTIF(" & F_PARTS & "!B:B,A" & r & ")"
    ws.Cells(r, 7).Formula = "=SUMIF(" & F_PARTS & "!B:B,A" & r & "," & F_PARTS & "!E:E)*25"

    quarts = QuartsDeFormule(CStr(ws.Range("K7").Value))
    If quarts > 0 Then
        MsgBox "Membre n° " & id & " inscrit." & vbCrLf & vbCrLf & "Parts attribuées :" & vbCrLf & _
               Attribuer(id, quarts), vbInformation
    Else
        MsgBox "Membre n° " & id & " inscrit (aucune formule choisie).", vbInformation
    End If
    ws.Range("K2:K6").ClearContents
    ws.Range("K2").Select
End Sub

' Lit et contrôle la zone de saisie K2:K6 (idExclu = fiche en cours de modification)
Private Function LireFiche(ByVal idExclu As Long, nom As String, prenom As String, tel As String, _
                           tel2 As String, cni As String) As Boolean
    Dim ws As Worksheet, r As Long
    Set ws = Feuille(F_MEMBRES)
    nom = UCase$(Trim$(CStr(ws.Range("K2").Value)))
    prenom = Application.WorksheetFunction.Proper(Trim$(CStr(ws.Range("K3").Value)))
    tel = NettoyerTel(CStr(ws.Range("K4").Value))
    tel2 = NettoyerTel(CStr(ws.Range("K5").Value))
    cni = UCase$(Replace(Trim$(CStr(ws.Range("K6").Value)), " ", ""))
    If tel2 = tel Then tel2 = ""
    If nom = "" Or prenom = "" Or tel = "" Then
        MsgBox "Nom, prénom et téléphone sont obligatoires.", vbExclamation: Exit Function
    End If
    For r = 2 To DerniereLigne(ws)
        If CLng(Val(ws.Cells(r, 1).Value)) <> idExclu Then
            If CStr(ws.Cells(r, M_TEL).Value) = tel Or CStr(ws.Cells(r, M_TEL2).Value) = tel Then
                MsgBox "Le numéro " & tel & " est déjà utilisé par " & ws.Cells(r, 2).Value & " " & ws.Cells(r, 3).Value & ".", vbExclamation
                Exit Function
            End If
            If cni <> "" And CStr(ws.Cells(r, M_CNI).Value) = cni Then
                MsgBox "Le n° CNI " & cni & " est déjà enregistré pour " & ws.Cells(r, 2).Value & " " & ws.Cells(r, 3).Value & ".", vbExclamation
                Exit Function
            End If
        End If
    Next r
    LireFiche = True
End Function

Private Sub EcrireFiche(ByVal r As Long, ByVal nom As String, ByVal prenom As String, ByVal tel As String, _
                        ByVal tel2 As String, ByVal cni As String)
    Dim ws As Worksheet
    Set ws = Feuille(F_MEMBRES)
    ws.Cells(r, 2).Value = nom
    ws.Cells(r, 3).Value = prenom
    ws.Range(ws.Cells(r, M_TEL), ws.Cells(r, M_TEL)).NumberFormat = "@"
    ws.Cells(r, M_TEL).Value = tel
    ws.Range(ws.Cells(r, M_TEL2), ws.Cells(r, M_CNI)).NumberFormat = "@"
    ws.Cells(r, M_TEL2).Value = tel2
    ws.Cells(r, M_CNI).Value = cni
End Sub

Private Function NettoyerTel(ByVal t As String) As String
    NettoyerTel = Replace(Replace(Replace(Trim$(t), " ", ""), ".", ""), "-", "")
End Function

' Charge la ligne sélectionnée dans la zone de saisie pour correction
Public Sub ChargerMembrePourModification()
    Dim ws As Worksheet, r As Long
    Set ws = Feuille(F_MEMBRES)
    If ActiveSheet.Name <> F_MEMBRES Then ws.Activate: MsgBox "Sélectionnez la ligne du membre à modifier.": Exit Sub
    r = ActiveCell.Row
    If r < 2 Or ActiveCell.Column > M_CNI Or ws.Cells(r, 1).Value = "" Then
        MsgBox "Cliquez d'abord sur la ligne du membre à modifier (colonnes A à I).", vbExclamation: Exit Sub
    End If
    ws.Range("K2").Value = ws.Cells(r, 2).Value
    ws.Range("K3").Value = ws.Cells(r, 3).Value
    ws.Range("K4").Value = CStr(ws.Cells(r, M_TEL).Value)
    ws.Range("K5").Value = CStr(ws.Cells(r, M_TEL2).Value)
    ws.Range("K6").Value = CStr(ws.Cells(r, M_CNI).Value)
    ws.Range("K8").Value = ws.Cells(r, 1).Value
    ws.Range("K2").Select
    Application.StatusBar = "Corrigez la zone jaune puis cliquez sur « Enregistrer les modifications »."
End Sub

Public Sub EnregistrerModificationMembre()
    Dim ws As Worksheet, id As Long, r As Long, nom As String, prenom As String, tel As String, tel2 As String, cni As String
    Set ws = Feuille(F_MEMBRES)
    id = CLng(Val(ws.Range("K8").Value))
    If id = 0 Then MsgBox "Aucune fiche en cours de modification. Utilisez d'abord « Modifier le membre sélectionné ».", vbExclamation: Exit Sub
    r = TrouverLigne(ws, 1, id)
    If r = 0 Then MsgBox "Fiche introuvable.", vbExclamation: Exit Sub
    If Not LireFiche(id, nom, prenom, tel, tel2, cni) Then Exit Sub
    EcrireFiche r, nom, prenom, tel, tel2, cni
    SynchroniserMembre id
    ws.Range("K2:K6").ClearContents
    ws.Range("K8").ClearContents
    Application.StatusBar = False
    MsgBox "Fiche n° " & id & " mise à jour.", vbInformation
End Sub

' Recopie le nom et le téléphone d'un membre dans Parts, Suivi_Paiements (échéances non clôturées) et Remises
Private Sub SynchroniserMembre(ByVal membreId As Long)
    Dim wsM As Worksheet, wsP As Worksheet, wsS As Worksheet, wsR As Worksheet
    Dim rm As Long, r As Long, s As Long, nomComplet As String, tel As String, cni As String, partId As Long
    Set wsM = Feuille(F_MEMBRES): Set wsP = Feuille(F_PARTS): Set wsS = Feuille(F_SUIVI): Set wsR = Feuille(F_REMISES)
    rm = TrouverLigne(wsM, 1, membreId)
    nomComplet = wsM.Cells(rm, 2).Value & " " & wsM.Cells(rm, 3).Value
    tel = CStr(wsM.Cells(rm, M_TEL).Value)
    cni = CStr(wsM.Cells(rm, M_CNI).Value)
    For r = 2 To DerniereLigne(wsP)
        If CLng(wsP.Cells(r, P_MEMBRE).Value) = membreId Then
            wsP.Cells(r, P_NOM).Value = nomComplet
            partId = wsP.Cells(r, P_ID).Value
            For s = 2 To DerniereLigne(wsS)
                If wsS.Cells(s, S_PART).Value = partId And wsS.Cells(s, S_ECH).Value >= TourDuGroupe(CStr(wsS.Cells(s, S_CODE).Value)) Then
                    wsS.Cells(s, S_NOM).Value = nomComplet
                    wsS.Cells(s, S_TEL).Value = tel
                End If
            Next s
            For s = 2 To DerniereLigne(wsR)
                If wsR.Cells(s, R_PART).Value = partId And wsR.Cells(s, R_MODE).Value = "" Then
                    wsR.Cells(s, R_NOM).Value = nomComplet
                    wsR.Cells(s, R_TEL).Value = tel
                    wsR.Cells(s, R_CNI).Value = cni
                End If
            Next s
        End If
    Next r
End Sub

Public Sub AttribuerMembreSelectionne()
    Dim ws As Worksheet, r As Long, quarts As Long
    Set ws = Feuille(F_MEMBRES)
    If ActiveSheet.Name <> F_MEMBRES Then ws.Activate: MsgBox "Sélectionnez un membre dans le tableau.": Exit Sub
    r = ActiveCell.Row
    If r < 2 Or ActiveCell.Column > M_CNI Or ws.Cells(r, 1).Value = "" Then
        MsgBox "Cliquez d'abord sur la ligne d'un membre (colonnes A à I).", vbExclamation: Exit Sub
    End If
    quarts = QuartsDeFormule(CStr(ws.Range("K7").Value))
    If quarts = 0 Then MsgBox "Choisissez une formule en K7.", vbExclamation: Exit Sub
    If MsgBox("Attribuer « " & ws.Range("K7").Value & " » à " & ws.Cells(r, 2).Value & " " & _
              ws.Cells(r, 3).Value & " ?", vbYesNo + vbQuestion) = vbNo Then Exit Sub
    MsgBox "Parts attribuées :" & vbCrLf & Attribuer(CLng(ws.Cells(r, 1).Value), quarts), vbInformation
End Sub

' Cœur de l'algorithme (identique en Python et PHP) :
'   quarts = 4 -> 1 groupe ; 2 -> 2 groupes ; 1 -> 4 groupes différents.
'   On cherche d'abord une case que la part complète EXACTEMENT,
'   sinon la première case ayant assez de place ; sinon on crée un groupe.
Public Function Attribuer(ByVal membreId As Long, ByVal quarts As Long) As String
    Dim wsG As Worksheet, nb As Long, mise As Double, lastG As Long
    Dim gids() As Long, occ() As Long, nC As Long, i As Long, p As Long
    Dim o As Variant, choixG() As Long, choixP() As Long, nChoix As Long
    Dim k As Long, exact As Long, c As Long, libre As Long, trouve As Boolean, desc As String

    nb = QUARTS_CASE \ quarts
    mise = MiseReference()
    Set wsG = Feuille(F_GROUPES)
    lastG = DerniereLigne(wsG)
    ReDim gids(1 To Application.WorksheetFunction.Max(1, lastG))
    ReDim occ(1 To Application.WorksheetFunction.Max(1, lastG), 1 To NB_POS)

    ' groupes candidats : ouverts, même mise, où le membre n'a pas encore de part
    For i = 2 To lastG
        If wsG.Cells(i, G_STATUT).Value = "OUVERT" And wsG.Cells(i, G_MISE).Value = mise Then
            If Not MembreDansGroupe(membreId, CLng(wsG.Cells(i, G_ID).Value)) Then
                nC = nC + 1
                gids(nC) = CLng(wsG.Cells(i, G_ID).Value)
                o = Occupation(gids(nC))
                For p = 1 To NB_POS: occ(nC, p) = o(p): Next p
            End If
        End If
    Next i

    ReDim choixG(1 To nb)
    ReDim choixP(1 To nb)
    For k = 1 To nb
        trouve = False
        For exact = 1 To 0 Step -1
            For c = 1 To nC
                If Not DejaChoisi(choixG, nChoix, gids(c)) Then
                    For p = 1 To NB_POS
                        libre = QUARTS_CASE - occ(c, p)
                        If (exact = 1 And libre = quarts) Or (exact = 0 And libre >= quarts) Then
                            nChoix = nChoix + 1
                            choixG(nChoix) = gids(c)
                            choixP(nChoix) = p
                            occ(c, p) = occ(c, p) + quarts
                            trouve = True
                            Exit For
                        End If
                    Next p
                End If
                If trouve Then Exit For
            Next c
            If trouve Then Exit For
        Next exact
        If Not trouve Then Exit For
    Next k

    Do While nChoix < nb                ' pas assez de place : nouveaux groupes
        nChoix = nChoix + 1
        choixG(nChoix) = CreerGroupe(mise)
        choixP(nChoix) = 1
    Loop

    For k = 1 To nb
        AjouterPart membreId, choixG(k), choixP(k), quarts
        desc = desc & "  - Groupe " & CodeGroupe(choixG(k)) & ", tour " & choixP(k) & _
               " (" & quarts * 25 & " %)" & vbCrLf
    Next k
    Attribuer = desc
End Function

'=====================================================================
'  GROUPES DE DIX : affichage, création, démarrage
'=====================================================================
Public Sub AfficherGroupe()
    Dim ws As Worksheet, gid As Long, rg As Long, p As Long, r As Long
    Dim wsP As Worksheet, wsG As Worksheet, last As Long
    Dim noms As String, q As Long, statut As String, tour As Long, mise As Double, etat As String

    Set ws = Feuille(F_GESTION)
    Set wsG = Feuille(F_GROUPES)
    Set wsP = Feuille(F_PARTS)
    Application.ScreenUpdating = False
    ws.Range("A2:E2").ClearContents
    ws.Range(ws.Cells(GG_LIGNE1, 1), ws.Cells(GG_LIGNE1 + NB_POS - 1, 5)).Clear
    ws.Range("A17:F1000").Clear

    gid = GroupeActif(False)
    If gid > 0 Then
        rg = TrouverLigne(wsG, G_ID, gid)
        statut = wsG.Cells(rg, G_STATUT).Value
        tour = wsG.Cells(rg, G_TOUR).Value
        mise = wsG.Cells(rg, G_MISE).Value
        ws.Range("A2").Value = "Statut : " & statut & "   ·   Mise : " & Format(mise, "#,##0") & " F" & _
            "   ·   Lot d'une case : " & Format(mise * NB_POS, "#,##0") & " F" & _
            IIf(statut = "EN_COURS", "   ·   Échéance en cours : " & tour & "/10", "")
        ws.Range("A2").Font.Italic = True
        last = DerniereLigne(wsP)
        For p = 1 To NB_POS
            noms = "": q = 0
            For r = 2 To last
                If CLng(wsP.Cells(r, P_GROUPE).Value) = gid And CLng(wsP.Cells(r, P_POS).Value) = p Then
                    noms = noms & IIf(noms = "", "", "  +  ") & wsP.Cells(r, P_NOM).Value & _
                           " (" & wsP.Cells(r, P_QUARTS).Value * 25 & " %)"
                    q = q + wsP.Cells(r, P_QUARTS).Value
                End If
            Next r
            If statut = "OUVERT" Then
                etat = IIf(q = QUARTS_CASE, "Complet", "À compléter")
            ElseIf p < tour Then
                etat = "Reçu"
            ElseIf p = tour Then
                etat = "Bénéficiaire du mois"
            Else
                etat = "En attente"
            End If
            With ws.Rows(GG_LIGNE1 + p - 1)
                .Cells(1, 1).Value = p
                .Cells(1, 2).Value = IIf(noms = "", "— libre —", noms)
                .Cells(1, 3).Value = q * 25 & " %"
                .Cells(1, 4).Value = mise * NB_POS * q / QUARTS_CASE
                .Cells(1, 4).NumberFormat = FMT_FCFA
                .Cells(1, 5).Value = etat
            End With
            With ws.Range(ws.Cells(GG_LIGNE1 + p - 1, 1), ws.Cells(GG_LIGNE1 + p - 1, 5))
                .Borders.LineStyle = xlContinuous
                .Borders.Color = RGB(210, 210, 210)
                Select Case etat
                    Case "Reçu": .Font.Color = RGB(130, 130, 130)
                    Case "Bénéficiaire du mois": .Interior.Color = RGB(255, 244, 204)
                    Case "À compléter": .Interior.Color = RGB(250, 225, 222)
                End Select
            End With
        Next p
        ws.Range(ws.Cells(GG_LIGNE1, 1), ws.Cells(GG_LIGNE1 + NB_POS - 1, 1)).HorizontalAlignment = xlCenter
        ws.Range(ws.Cells(GG_LIGNE1, 3), ws.Cells(GG_LIGNE1 + NB_POS - 1, 3)).HorizontalAlignment = xlCenter
    End If

    ' récapitulatif de tous les groupes
    ws.Range("A17:E17").Value = Array("Groupe", "Statut", "Rempli", "Échéance", "Mise")
    StyleEntete ws.Range("A17:E17")
    r = 18
    For rg = 2 To DerniereLigne(wsG)
        ws.Cells(r, 1).Value = wsG.Cells(rg, G_CODE).Value
        ws.Cells(r, 2).Value = wsG.Cells(rg, G_STATUT).Value
        ws.Cells(r, 3).Value = Application.WorksheetFunction.SumIf(wsP.Columns(P_GROUPE), wsG.Cells(rg, G_ID).Value, _
                               wsP.Columns(P_QUARTS)) * 25 / NB_POS & " %"
        ws.Cells(r, 4).Value = IIf(wsG.Cells(rg, G_STATUT).Value = "EN_COURS", wsG.Cells(rg, G_TOUR).Value & "/10", "")
        ws.Cells(r, 5).Value = wsG.Cells(rg, G_MISE).Value
        ws.Cells(r, 5).NumberFormat = FMT_FCFA
        r = r + 1
    Next rg
    Application.ScreenUpdating = True
End Sub

Public Sub NouveauGroupe()
    Dim gid As Long
    gid = CreerGroupe(MiseReference())
    Feuille(F_GESTION).Range(GG_CELLULE_GROUPE).Value = CodeGroupe(gid)
    AfficherGroupe
End Sub

Public Sub DemarrerGroupe()
    Dim gid As Long, rg As Long, o As Variant, p As Long, manque As String, wsG As Worksheet
    gid = GroupeActif(True): If gid = 0 Then Exit Sub
    Set wsG = Feuille(F_GROUPES)
    rg = TrouverLigne(wsG, G_ID, gid)
    If wsG.Cells(rg, G_STATUT).Value <> "OUVERT" Then MsgBox "Ce groupe est déjà démarré.", vbExclamation: Exit Sub
    o = Occupation(gid)
    For p = 1 To NB_POS
        If o(p) <> QUARTS_CASE Then manque = manque & IIf(manque = "", "", ", ") & p
    Next p
    If manque <> "" Then
        MsgBox "Positions incomplètes : " & manque & vbCrLf & _
               "Les 10 cases doivent être remplies à 100 % avant de démarrer.", vbExclamation
        Exit Sub
    End If
    If MsgBox("Démarrer le groupe " & CodeGroupe(gid) & " ?" & vbCrLf & _
              "Plus aucune part ne pourra y être ajoutée. L'échéance 1 sera ouverte.", vbYesNo + vbQuestion) = vbNo Then Exit Sub
    wsG.Cells(rg, G_STATUT).Value = "EN_COURS"
    wsG.Cells(rg, G_TOUR).Value = 1
    wsG.Cells(rg, G_DEBUT).Value = Date
    wsG.Cells(rg, G_DEBUT).NumberFormat = "dd/mm/yyyy"
    GenererEcheance gid, 1
    GenererRemises gid, 1
    AfficherGroupe
    MsgBox "Groupe démarré. Les lignes de l'échéance 1 sont dans Suivi_Paiements ; " & _
           "le lot du tour 1 est à remettre (feuille Remises).", vbInformation
End Sub

'=====================================================================
'  MACRO 2 : PERMUTATION DES TOURS
'  Sélectionner 2 ou 3 lignes du tableau de 10 (Ctrl + clic) puis cliquer.
'  2 lignes : A <-> B   ·   3 lignes : A -> B -> C -> A
'=====================================================================
Public Sub PermuterToursSelectionnes()
    Dim ws As Worksheet, gid As Long, rg As Long, wsG As Worksheet
    Dim pos(1 To 3) As Long, n As Long, zone As Range, cel As Range, v As Long, i As Long
    Dim saisie As String, morceaux As Variant

    Set ws = Feuille(F_GESTION)
    gid = GroupeActif(True): If gid = 0 Then Exit Sub

    ' 1) lire les positions sélectionnées
    If ActiveSheet.Name = F_GESTION Then
        For Each zone In Selection.Areas
            For Each cel In zone.Rows
                If cel.Row >= GG_LIGNE1 And cel.Row < GG_LIGNE1 + NB_POS Then
                    v = cel.Row - GG_LIGNE1 + 1
                    If Not DejaChoisi(pos, n, v) Then
                        If n = 3 Then MsgBox "Sélectionnez au maximum 3 tours.", vbExclamation: Exit Sub
                        n = n + 1: pos(n) = v
                    End If
                End If
            Next cel
        Next zone
    End If
    ' 2) à défaut, saisie manuelle « 3,7 » ou « 3,7,5 »
    If n < 2 Then
        saisie = InputBox("Tours à permuter, séparés par des virgules :" & vbCrLf & _
                          "  3,7     -> échange 3 et 7" & vbCrLf & "  3,7,5   -> rotation 3->7->5->3", "Permutation")
        If Trim$(saisie) = "" Then Exit Sub
        morceaux = Split(Replace(saisie, ";", ","), ",")
        n = 0
        For i = LBound(morceaux) To UBound(morceaux)
            If IsNumeric(Trim$(morceaux(i))) Then
                v = CLng(Trim$(morceaux(i)))
                If v >= 1 And v <= NB_POS And Not DejaChoisi(pos, n, v) And n < 3 Then n = n + 1: pos(n) = v
            End If
        Next i
    End If
    If n < 2 Then MsgBox "Il faut 2 ou 3 tours différents.", vbExclamation: Exit Sub

    ' 3) contrôles métier
    Set wsG = Feuille(F_GROUPES)
    rg = TrouverLigne(wsG, G_ID, gid)
    If wsG.Cells(rg, G_STATUT).Value = "CLOTURE" Then MsgBox "Ce groupe est clôturé.", vbExclamation: Exit Sub
    If wsG.Cells(rg, G_STATUT).Value = "EN_COURS" Then
        For i = 1 To n
            If pos(i) < wsG.Cells(rg, G_TOUR).Value Then
                MsgBox "Le tour " & pos(i) & " est déjà levé : permutation impossible.", vbExclamation: Exit Sub
            End If
        Next i
    End If
    For i = 1 To n
        If TourDejaRemis(gid, pos(i)) Then
            MsgBox "Le lot du tour " & pos(i) & " est déjà remis : permutation impossible.", vbExclamation: Exit Sub
        End If
    Next i
    If MsgBox("Permuter : " & DescriptionPermutation(pos, n) & vbCrLf & vbCrLf & _
              "Les membres concernés ont-ils donné leur accord ?", vbYesNo + vbQuestion) = vbNo Then Exit Sub

    AppliquerPermutation gid, pos, n
    RecalerRemisesTourCourant gid
    AfficherGroupe
    MsgBox "Permutation effectuée : " & DescriptionPermutation(pos, n), vbInformation
End Sub

Private Sub AppliquerPermutation(ByVal gid As Long, pos() As Long, ByVal n As Long)
    Dim wsP As Worksheet, wsS As Worksheet, wsH As Worksheet, r As Long, i As Long, rp As Long, hr As Long
    Set wsP = Feuille(F_PARTS)
    Set wsS = Feuille(F_SUIVI)
    Set wsH = Feuille(F_PERM)
    For r = 2 To DerniereLigne(wsP)
        If CLng(wsP.Cells(r, P_GROUPE).Value) = gid Then
            For i = 1 To n
                If CLng(wsP.Cells(r, P_POS).Value) = pos(i) Then
                    wsP.Cells(r, P_POS).Value = pos((i Mod n) + 1)
                    Exit For
                End If
            Next i
        End If
    Next r
    ' mettre à jour la colonne « Tour » (affichage) du suivi des paiements
    For r = 2 To DerniereLigne(wsS)
        rp = TrouverLigne(wsP, P_ID, wsS.Cells(r, S_PART).Value)
        If rp > 0 Then
            If CLng(wsP.Cells(rp, P_GROUPE).Value) = gid Then wsS.Cells(r, S_TOUR).Value = wsP.Cells(rp, P_POS).Value
        End If
    Next r
    ' historique
    hr = DerniereLigne(wsH) + 1
    wsH.Cells(hr, 1).Value = ProchainId(wsH)
    wsH.Cells(hr, 2).Value = gid
    wsH.Cells(hr, 3).Value = CodeGroupe(gid)
    wsH.Cells(hr, 4).Value = DescriptionPermutation(pos, n)
    wsH.Cells(hr, 5).Value = Now
    wsH.Cells(hr, 5).NumberFormat = "dd/mm/yyyy hh:mm"
End Sub

Private Function DescriptionPermutation(pos() As Long, ByVal n As Long) As String
    Dim i As Long, s As String
    For i = 1 To n
        s = s & IIf(s = "", "", ", ") & pos(i) & "->" & pos((i Mod n) + 1)
    Next i
    DescriptionPermutation = s
End Function

'=====================================================================
'  SUIVI DES PAIEMENTS
'=====================================================================
Public Sub MarquerPaye(): MarquerSelection "PAYE": End Sub
Public Sub MarquerImpaye(): MarquerSelection "IMPAYE": End Sub

Private Sub MarquerSelection(ByVal statut As String)
    Dim ws As Worksheet, zone As Range, ligne As Range, n As Long, fin As Long
    Set ws = Feuille(F_SUIVI)
    fin = DerniereLigne(ws)
    If ActiveSheet.Name <> F_SUIVI Then ws.Activate: MsgBox "Sélectionnez les lignes à marquer.": Exit Sub
    For Each zone In Selection.Areas
        For Each ligne In zone.Rows
            If ligne.Row > fin Then Exit For          ' colonne entière sélectionnée
            If ligne.Row >= 2 And ligne.EntireRow.Hidden = False Then
                If ws.Cells(ligne.Row, S_ID).Value <> "" Then
                    ws.Cells(ligne.Row, S_STATUT).Value = statut
                    If statut = "PAYE" Then
                        ws.Cells(ligne.Row, S_DATE).Value = Date
                    Else
                        ws.Cells(ligne.Row, S_DATE).ClearContents
                    End If
                    n = n + 1
                End If
            End If
        Next ligne
    Next zone
    Application.StatusBar = n & " ligne(s) marquée(s) " & statut
End Sub

Public Sub FiltrerEcheanceEnCours()
    Dim gid As Long, rg As Long, ws As Worksheet
    gid = GroupeActif(True): If gid = 0 Then Exit Sub
    rg = TrouverLigne(Feuille(F_GROUPES), G_ID, gid)
    Set ws = Feuille(F_SUIVI)
    ws.Activate
    ToutAfficher
    If DerniereLigne(ws) < 2 Then Exit Sub
    ws.Range("A1").CurrentRegion.AutoFilter Field:=S_CODE, Criteria1:=CodeGroupe(gid)
    ws.Range("A1").CurrentRegion.AutoFilter Field:=S_ECH, Criteria1:=CStr(Feuille(F_GROUPES).Cells(rg, G_TOUR).Value)
End Sub

Public Sub FiltrerImpayes()
    Dim ws As Worksheet
    Set ws = Feuille(F_SUIVI)
    ws.Activate
    If DerniereLigne(ws) < 2 Then Exit Sub
    ws.Range("A1").CurrentRegion.AutoFilter Field:=S_STATUT, Criteria1:="IMPAYE"
End Sub

Public Sub ToutAfficher()
    Dim ws As Worksheet
    Set ws = Feuille(F_SUIVI)
    If ws.AutoFilterMode Then
        If ws.FilterMode Then ws.ShowAllData
    End If
End Sub

Public Sub CloturerEcheance()
    Dim gid As Long, rg As Long, wsG As Worksheet, tour As Long
    Dim attendu As Double, encaisse As Double, msg As String
    gid = GroupeActif(True): If gid = 0 Then Exit Sub
    Set wsG = Feuille(F_GROUPES)
    rg = TrouverLigne(wsG, G_ID, gid)
    If wsG.Cells(rg, G_STATUT).Value <> "EN_COURS" Then
        MsgBox "Seul un groupe en cours peut avancer d'échéance.", vbExclamation: Exit Sub
    End If
    tour = wsG.Cells(rg, G_TOUR).Value
    Situation CodeGroupe(gid), tour, attendu, encaisse
    If LotsNonRemis(CodeGroupe(gid), tour) > 0 Then
        If MsgBox(LotsNonRemis(CodeGroupe(gid), tour) & " lot(s) du tour " & tour & " ne sont pas marqués comme remis " & _
                  "(feuille Remises : Mode vide)." & vbCrLf & "Continuer la clôture ?", vbYesNo + vbExclamation) = vbNo Then Exit Sub
    End If
    If attendu - encaisse > 0 Then
        msg = "Il reste " & Format(attendu - encaisse, "#,##0") & " F à recouvrer sur l'échéance " & tour & "." & _
              vbCrLf & "Clôturer quand même ? Les impayés passeront en RETARDS."
    Else
        msg = "Échéance " & tour & " entièrement payée (" & Format(encaisse, "#,##0") & " F)." & vbCrLf & _
              "Clôturer et remettre le lot au bénéficiaire ?"
    End If
    If MsgBox(msg, vbYesNo + vbQuestion, "Clôture " & CodeGroupe(gid)) = vbNo Then Exit Sub

    If tour >= NB_POS Then
        wsG.Cells(rg, G_TOUR).Value = 11
        wsG.Cells(rg, G_STATUT).Value = "CLOTURE"
        MsgBox "Groupe terminé : les 10 tours sont levés.", vbInformation
    Else
        wsG.Cells(rg, G_TOUR).Value = tour + 1
        GenererEcheance gid, tour + 1
        GenererRemises gid, tour + 1
        MsgBox "Échéance " & tour + 1 & " ouverte.", vbInformation
    End If
    AfficherGroupe
End Sub

Private Sub GenererEcheance(ByVal gid As Long, ByVal ech As Long)
    Dim wsP As Worksheet, wsS As Worksheet, wsM As Worksheet, r As Long, s As Long
    Dim mise As Double, partId As Long, existe As Boolean, rm As Long
    Set wsP = Feuille(F_PARTS)
    Set wsS = Feuille(F_SUIVI)
    Set wsM = Feuille(F_MEMBRES)
    mise = Feuille(F_GROUPES).Cells(TrouverLigne(Feuille(F_GROUPES), G_ID, gid), G_MISE).Value
    For r = 2 To DerniereLigne(wsP)
        If CLng(wsP.Cells(r, P_GROUPE).Value) = gid Then
            partId = wsP.Cells(r, P_ID).Value
            existe = False
            For s = 2 To DerniereLigne(wsS)
                If wsS.Cells(s, S_PART).Value = partId And wsS.Cells(s, S_ECH).Value = ech Then existe = True: Exit For
            Next s
            If Not existe Then
                s = DerniereLigne(wsS) + 1
                rm = TrouverLigne(wsM, 1, wsP.Cells(r, P_MEMBRE).Value)
                wsS.Cells(s, S_ID).Value = ProchainId(wsS)
                wsS.Cells(s, S_PART).Value = partId
                wsS.Cells(s, S_CODE).Value = wsP.Cells(r, P_CODE).Value
                wsS.Cells(s, S_ECH).Value = ech
                wsS.Cells(s, S_TOUR).Value = wsP.Cells(r, P_POS).Value
                wsS.Cells(s, S_NOM).Value = wsP.Cells(r, P_NOM).Value
                wsS.Cells(s, S_TEL).NumberFormat = "@"
                If rm > 0 Then wsS.Cells(s, S_TEL).Value = wsM.Cells(rm, 4).Value
                wsS.Cells(s, S_PCT).Value = wsP.Cells(r, P_QUARTS).Value * 25
                wsS.Cells(s, S_MONTANT).Value = mise * wsP.Cells(r, P_QUARTS).Value / QUARTS_CASE
                wsS.Cells(s, S_STATUT).Value = "IMPAYE"
            End If
        End If
    Next r
End Sub

' Calcule attendu / encaissé d'un groupe pour une échéance
Private Sub Situation(ByVal code As String, ByVal ech As Long, ByRef attendu As Double, ByRef encaisse As Double)
    Dim ws As Worksheet, r As Long
    Set ws = Feuille(F_SUIVI)
    attendu = 0: encaisse = 0
    For r = 2 To DerniereLigne(ws)
        If ws.Cells(r, S_CODE).Value = code And ws.Cells(r, S_ECH).Value = ech Then
            attendu = attendu + ws.Cells(r, S_MONTANT).Value
            If ws.Cells(r, S_STATUT).Value = "PAYE" Then encaisse = encaisse + ws.Cells(r, S_MONTANT).Value
        End If
    Next r
End Sub

'=====================================================================
'  MACRO 3 : EXTRACTION DES IMPAYÉS ET DU RESTANT À RECOUVRER
'=====================================================================
Public Sub RapportImpayes()
    Dim ws As Worksheet, wsG As Worksheet, wsS As Worksheet
    Dim r As Long, rg As Long, s As Long, ligne As Long, tour As Long, code As String
    Dim attendu As Double, encaisse As Double, totalRestant As Double, nbImp As Long, totalRetard As Double

    Set ws = Feuille(F_RAPPORT)
    Set wsG = Feuille(F_GROUPES)
    Set wsS = Feuille(F_SUIVI)
    Application.ScreenUpdating = False
    ws.Cells.Clear

    ws.Range("A1").Value = "RAPPORT DES IMPAYÉS - " & Format(Now, "dd/mm/yyyy hh:mm")
    ws.Range("A1").Font.Bold = True
    ws.Range("A1").Font.Size = 14

    ' --- A. Restant par groupe (échéance en cours)
    ligne = 3
    ws.Cells(ligne, 1).Value = "A. RESTANT À RECOUVRER POUR CLÔTURER LE LOT DU MOIS"
    ws.Cells(ligne, 1).Font.Bold = True
    ligne = ligne + 1
    ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 6)).Value = Array("Groupe", "Échéance", "Attendu", "Encaissé", "Restant", "Nb impayés")
    StyleEntete ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 6))
    For rg = 2 To DerniereLigne(wsG)
        If wsG.Cells(rg, G_STATUT).Value = "EN_COURS" Then
            ligne = ligne + 1
            code = wsG.Cells(rg, G_CODE).Value
            tour = wsG.Cells(rg, G_TOUR).Value
            Situation code, tour, attendu, encaisse
            nbImp = Application.WorksheetFunction.CountIfs(wsS.Columns(S_CODE), code, wsS.Columns(S_ECH), tour, _
                                                           wsS.Columns(S_STATUT), "IMPAYE")
            ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 6)).Value = Array(code, tour, attendu, encaisse, attendu - encaisse, nbImp)
            totalRestant = totalRestant + attendu - encaisse
        End If
    Next rg
    ligne = ligne + 1
    ws.Cells(ligne, 4).Value = "TOTAL"
    ws.Cells(ligne, 5).Value = totalRestant
    ws.Range(ws.Cells(ligne, 4), ws.Cells(ligne, 5)).Font.Bold = True
    ws.Range("C5:E" & ligne).NumberFormat = FMT_FCFA

    ' --- B. Impayés de l'échéance en cours
    ligne = ligne + 2
    ws.Cells(ligne, 1).Value = "B. IMPAYÉS DE L'ÉCHÉANCE EN COURS"
    ws.Cells(ligne, 1).Font.Bold = True
    ligne = ligne + 1
    EnteteDetail ws, ligne
    r = ligne
    For s = 2 To DerniereLigne(wsS)
        If wsS.Cells(s, S_STATUT).Value = "IMPAYE" Then
            tour = TourDuGroupe(CStr(wsS.Cells(s, S_CODE).Value))
            If wsS.Cells(s, S_ECH).Value = tour Then r = r + 1: CopierDetail wsS, s, ws, r
        End If
    Next s
    ligne = r

    ' --- C. Retards (échéances déjà clôturées)
    ligne = ligne + 2
    ws.Cells(ligne, 1).Value = "C. RETARDS (ÉCHÉANCES PASSÉES NON PAYÉES)"
    ws.Cells(ligne, 1).Font.Bold = True
    ligne = ligne + 1
    EnteteDetail ws, ligne
    r = ligne
    For s = 2 To DerniereLigne(wsS)
        If wsS.Cells(s, S_STATUT).Value = "IMPAYE" Then
            tour = TourDuGroupe(CStr(wsS.Cells(s, S_CODE).Value))
            If wsS.Cells(s, S_ECH).Value < tour Then
                r = r + 1: CopierDetail wsS, s, ws, r
                totalRetard = totalRetard + wsS.Cells(s, S_MONTANT).Value
            End If
        End If
    Next s
    ws.Cells(r + 1, 6).Value = "TOTAL"
    ws.Cells(r + 1, 7).Value = totalRetard
    ws.Cells(r + 1, 7).NumberFormat = FMT_FCFA
    ws.Range(ws.Cells(r + 1, 6), ws.Cells(r + 1, 7)).Font.Bold = True

    ws.Columns("A:G").AutoFit
    ws.Activate
    Application.ScreenUpdating = True
End Sub

Private Sub EnteteDetail(ws As Worksheet, ByVal ligne As Long)
    ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 7)).Value = Array("Groupe", "Échéance", "Tour", "Membre", "Téléphone", "Part %", "Montant")
    StyleEntete ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 7))
End Sub

Private Sub CopierDetail(wsS As Worksheet, ByVal s As Long, ws As Worksheet, ByVal r As Long)
    ws.Cells(r, 1).Value = wsS.Cells(s, S_CODE).Value
    ws.Cells(r, 2).Value = wsS.Cells(s, S_ECH).Value
    ws.Cells(r, 3).Value = wsS.Cells(s, S_TOUR).Value
    ws.Cells(r, 4).Value = wsS.Cells(s, S_NOM).Value
    ws.Cells(r, 5).NumberFormat = "@"
    ws.Cells(r, 5).Value = wsS.Cells(s, S_TEL).Value
    ws.Cells(r, 6).Value = wsS.Cells(s, S_PCT).Value & " %"
    ws.Cells(r, 7).Value = wsS.Cells(s, S_MONTANT).Value
    ws.Cells(r, 7).NumberFormat = FMT_FCFA
End Sub

'=====================================================================
'  LISTES DE CONTRÔLE : Payés · Reçus · Non reçus
'=====================================================================
Public Sub ListesControle()
    Dim ws As Worksheet, wsG As Worksheet, wsS As Worksheet, wsP As Worksheet
    Dim r As Long, s As Long, ligne As Long, rg As Long, statut As String, tour As Long, pos As Long, mise As Double

    Set ws = Feuille(F_LISTES)
    Set wsG = Feuille(F_GROUPES)
    Set wsS = Feuille(F_SUIVI)
    Set wsP = Feuille(F_PARTS)
    Application.ScreenUpdating = False
    ws.Cells.Clear
    ws.Range("A1").Value = "LISTES DE CONTRÔLE - " & Format(Now, "dd/mm/yyyy hh:mm")
    ws.Range("A1").Font.Bold = True
    ws.Range("A1").Font.Size = 14

    ' 1. Payés de l'échéance en cours
    ligne = 3
    ws.Cells(ligne, 1).Value = "1. PAYÉS (ÉCHÉANCE EN COURS)": ws.Cells(ligne, 1).Font.Bold = True
    ligne = ligne + 1
    EnteteDetail ws, ligne
    For s = 2 To DerniereLigne(wsS)
        If wsS.Cells(s, S_STATUT).Value = "PAYE" Then
            If wsS.Cells(s, S_ECH).Value = TourDuGroupe(CStr(wsS.Cells(s, S_CODE).Value)) Then
                ligne = ligne + 1: CopierDetail wsS, s, ws, ligne
            End If
        End If
    Next s

    ' 2. Reçus et 3. Non reçus
    Dim section As Long
    For section = 2 To 3
        ligne = ligne + 2
        ws.Cells(ligne, 1).Value = IIf(section = 2, "2. REÇUS (ONT LEVÉ LA TONTINE)", "3. NON REÇUS (ATTENDENT LEUR TOUR)")
        ws.Cells(ligne, 1).Font.Bold = True
        ligne = ligne + 1
        ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 6)).Value = Array("Groupe", "Tour", "Membre", "Part %", "État", "Lot")
        StyleEntete ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 6))
        For r = 2 To DerniereLigne(wsP)
            rg = TrouverLigne(wsG, G_ID, wsP.Cells(r, P_GROUPE).Value)
            statut = wsG.Cells(rg, G_STATUT).Value
            tour = wsG.Cells(rg, G_TOUR).Value
            mise = wsG.Cells(rg, G_MISE).Value
            pos = wsP.Cells(r, P_POS).Value
            If (section = 2 And statut <> "OUVERT" And pos < tour) Or _
               (section = 3 And (statut = "OUVERT" Or pos >= tour)) Then
                ligne = ligne + 1
                ws.Cells(ligne, 1).Value = wsP.Cells(r, P_CODE).Value
                ws.Cells(ligne, 2).Value = pos
                ws.Cells(ligne, 3).Value = wsP.Cells(r, P_NOM).Value
                ws.Cells(ligne, 4).Value = wsP.Cells(r, P_QUARTS).Value * 25 & " %"
                If section = 2 Then
                    ws.Cells(ligne, 5).Value = "Reçu"
                ElseIf statut = "EN_COURS" And pos = tour Then
                    ws.Cells(ligne, 5).Value = "Bénéficiaire du mois"
                    ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 6)).Interior.Color = RGB(255, 244, 204)
                Else
                    ws.Cells(ligne, 5).Value = "En attente"
                End If
                ws.Cells(ligne, 6).Value = mise * NB_POS * wsP.Cells(r, P_QUARTS).Value / QUARTS_CASE
                ws.Cells(ligne, 6).NumberFormat = FMT_FCFA
            End If
        Next r
    Next section

    ' 4. Lots à remettre et 5. Lots remis (feuille Remises)
    Dim wsR As Worksheet
    Set wsR = Feuille(F_REMISES)
    For section = 4 To 5
        ligne = ligne + 2
        ws.Cells(ligne, 1).Value = IIf(section = 4, "4. LOTS À REMETTRE", "5. LOTS REMIS (RÉFÉRENCES DE PAIEMENT)")
        ws.Cells(ligne, 1).Font.Bold = True
        ligne = ligne + 1
        ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 8)).Value = Array("Groupe", "Tour", "Bénéficiaire", "N° CNI", "Montant", "Mode", "Référence", "Date")
        StyleEntete ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, 8))
        For r = 2 To DerniereLigne(wsR)
            If (section = 4) = (wsR.Cells(r, R_MODE).Value = "") Then
                ligne = ligne + 1
                ws.Cells(ligne, 1).Value = wsR.Cells(r, R_CODE).Value
                ws.Cells(ligne, 2).Value = wsR.Cells(r, R_TOUR).Value
                ws.Cells(ligne, 3).Value = wsR.Cells(r, R_NOM).Value
                ws.Cells(ligne, 4).NumberFormat = "@"
                ws.Cells(ligne, 4).Value = CStr(wsR.Cells(r, R_CNI).Value)
                ws.Cells(ligne, 5).Value = wsR.Cells(r, R_MONTANT).Value
                ws.Cells(ligne, 5).NumberFormat = FMT_FCFA
                ws.Cells(ligne, 6).Value = wsR.Cells(r, R_MODE).Value
                ws.Cells(ligne, 7).NumberFormat = "@"
                ws.Cells(ligne, 7).Value = CStr(wsR.Cells(r, R_REF).Value)
                ws.Cells(ligne, 8).Value = wsR.Cells(r, R_DATE).Value
                ws.Cells(ligne, 8).NumberFormat = "dd/mm/yyyy"
            End If
        Next r
    Next section

    ws.Columns("A:H").AutoFit
    ws.Activate
    Application.ScreenUpdating = True
End Sub

'=====================================================================
'  TIRAGE AU SORT ET REMPLACEMENT D'UN TITULAIRE
'=====================================================================
' Groupe ouvert : les 10 tours. Groupe en cours : seulement les tours après le tour courant.
' Les co-titulaires d'une même case restent ensemble.
Public Sub TirageAuSort()
    Dim gid As Long, rg As Long, wsG As Worksheet, wsP As Worksheet, wsS As Worksheet, wsH As Worksheet
    Dim debut As Long, n As Long, i As Long, j As Long, x As Long, r As Long, rp As Long, hr As Long
    Dim origine() As Long, tiree() As Long, desc As String

    gid = GroupeActif(True): If gid = 0 Then Exit Sub
    Set wsG = Feuille(F_GROUPES)
    rg = TrouverLigne(wsG, G_ID, gid)
    If wsG.Cells(rg, G_STATUT).Value = "CLOTURE" Then MsgBox "Ce groupe est clôturé.", vbExclamation: Exit Sub
    debut = IIf(wsG.Cells(rg, G_STATUT).Value = "EN_COURS", wsG.Cells(rg, G_TOUR).Value + 1, 1)
    n = NB_POS - debut + 1
    If n < 2 Then MsgBox "Il ne reste pas assez de tours à tirer au sort.", vbExclamation: Exit Sub
    If MsgBox("Tirer au sort les tours " & debut & " à 10 du groupe " & CodeGroupe(gid) & " ?" & vbCrLf & _
              "Les co-titulaires d'une même case restent ensemble.", vbYesNo + vbQuestion) = vbNo Then Exit Sub

    ReDim origine(1 To n): ReDim tiree(1 To n)
    For i = 1 To n: origine(i) = debut + i - 1: tiree(i) = debut + i - 1: Next i
    Randomize
    For i = n To 2 Step -1                      ' mélange de Fisher-Yates
        j = Int(Rnd() * i) + 1
        x = tiree(i): tiree(i) = tiree(j): tiree(j) = x
    Next i

    Set wsP = Feuille(F_PARTS)
    For r = 2 To DerniereLigne(wsP)
        If CLng(wsP.Cells(r, P_GROUPE).Value) = gid Then
            x = wsP.Cells(r, P_POS).Value
            If x >= debut Then wsP.Cells(r, P_POS).Value = tiree(x - debut + 1)
        End If
    Next r
    Set wsS = Feuille(F_SUIVI)
    For r = 2 To DerniereLigne(wsS)
        rp = TrouverLigne(wsP, P_ID, wsS.Cells(r, S_PART).Value)
        If rp > 0 Then
            If CLng(wsP.Cells(rp, P_GROUPE).Value) = gid Then wsS.Cells(r, S_TOUR).Value = wsP.Cells(rp, P_POS).Value
        End If
    Next r
    For i = 1 To n
        If origine(i) <> tiree(i) Then desc = desc & IIf(desc = "", "", ", ") & origine(i) & "->" & tiree(i)
    Next i
    If desc = "" Then desc = "ordre inchangé"
    desc = "Tirage au sort (tours " & debut & " à 10) : " & desc

    Set wsH = Feuille(F_PERM)
    hr = DerniereLigne(wsH) + 1
    wsH.Cells(hr, 1).Value = ProchainId(wsH)
    wsH.Cells(hr, 2).Value = gid
    wsH.Cells(hr, 3).Value = CodeGroupe(gid)
    wsH.Cells(hr, 4).Value = desc
    wsH.Cells(hr, 5).Value = Now
    wsH.Cells(hr, 5).NumberFormat = "dd/mm/yyyy hh:mm"
    AfficherGroupe
    MsgBox desc, vbInformation, "Résultat du tirage"
End Sub

' Cède la part d'un membre à un autre membre déjà inscrit (départ, cession…)
Public Sub RemplacerTitulaire()
    Dim gid As Long, wsP As Worksheet, wsM As Worksheet, wsS As Worksheet, wsH As Worksheet, wsR As Worksheet
    Dim ancien As Long, nouveau As Long, rp As Long, r As Long, rm As Long, hr As Long, partId As Long, s As String
    Dim nomAncien As String, nomNouveau As String

    gid = GroupeActif(True): If gid = 0 Then Exit Sub
    If Feuille(F_GROUPES).Cells(TrouverLigne(Feuille(F_GROUPES), G_ID, gid), G_STATUT).Value = "CLOTURE" Then
        MsgBox "Ce groupe est clôturé.", vbExclamation: Exit Sub
    End If
    Set wsP = Feuille(F_PARTS): Set wsM = Feuille(F_MEMBRES)
    s = InputBox("Groupe " & CodeGroupe(gid) & vbCrLf & "N° (colonne ID de la feuille Membres) du membre qui CÈDE sa part :", "Remplacer un titulaire")
    If Trim$(s) = "" Then Exit Sub
    ancien = CLng(Val(s))
    For r = 2 To DerniereLigne(wsP)
        If CLng(wsP.Cells(r, P_GROUPE).Value) = gid And CLng(wsP.Cells(r, P_MEMBRE).Value) = ancien Then rp = r: Exit For
    Next r
    If rp = 0 Then MsgBox "Ce membre n'a pas de part dans le groupe " & CodeGroupe(gid) & ".", vbExclamation: Exit Sub
    s = InputBox("N° du NOUVEAU titulaire (il doit déjà être inscrit dans Membres) :", "Remplacer un titulaire")
    If Trim$(s) = "" Then Exit Sub
    nouveau = CLng(Val(s))
    rm = TrouverLigne(wsM, 1, nouveau)
    If rm = 0 Then MsgBox "Membre n° " & nouveau & " introuvable.", vbExclamation: Exit Sub
    If nouveau = ancien Then MsgBox "Le nouveau titulaire est le même que l'ancien.", vbExclamation: Exit Sub
    If MembreDansGroupe(nouveau, gid) Then MsgBox "Ce membre a déjà une part dans le groupe " & CodeGroupe(gid) & ".", vbExclamation: Exit Sub

    nomAncien = wsP.Cells(rp, P_NOM).Value
    nomNouveau = wsM.Cells(rm, 2).Value & " " & wsM.Cells(rm, 3).Value
    If MsgBox("Tour " & wsP.Cells(rp, P_POS).Value & " : céder la part de " & nomAncien & " à " & nomNouveau & " ?", _
              vbYesNo + vbQuestion) = vbNo Then Exit Sub
    wsP.Cells(rp, P_MEMBRE).Value = nouveau
    wsP.Cells(rp, P_NOM).Value = nomNouveau
    SynchroniserMembre nouveau

    Set wsH = Feuille(F_PERM)
    hr = DerniereLigne(wsH) + 1
    wsH.Cells(hr, 1).Value = ProchainId(wsH)
    wsH.Cells(hr, 2).Value = gid
    wsH.Cells(hr, 3).Value = CodeGroupe(gid)
    wsH.Cells(hr, 4).Value = "Tour " & wsP.Cells(rp, P_POS).Value & " : " & nomAncien & " remplacé(e) par " & nomNouveau
    wsH.Cells(hr, 5).Value = Now
    wsH.Cells(hr, 5).NumberFormat = "dd/mm/yyyy hh:mm"
    AfficherGroupe
    MsgBox "Titulaire remplacé.", vbInformation
End Sub

'=====================================================================
'  REMISE DU LOT AUX BÉNÉFICIAIRES (feuille Remises)
'=====================================================================
' Crée une ligne « à remettre » pour chaque bénéficiaire du tour qui s'ouvre
Private Sub GenererRemises(ByVal gid As Long, ByVal tour As Long)
    Dim wsP As Worksheet, wsR As Worksheet, wsM As Worksheet, r As Long, s As Long, rm As Long
    Dim mise As Double, partId As Long, existe As Boolean
    Set wsP = Feuille(F_PARTS): Set wsR = Feuille(F_REMISES): Set wsM = Feuille(F_MEMBRES)
    mise = Feuille(F_GROUPES).Cells(TrouverLigne(Feuille(F_GROUPES), G_ID, gid), G_MISE).Value
    For r = 2 To DerniereLigne(wsP)
        If CLng(wsP.Cells(r, P_GROUPE).Value) = gid And CLng(wsP.Cells(r, P_POS).Value) = tour Then
            partId = wsP.Cells(r, P_ID).Value
            existe = False
            For s = 2 To DerniereLigne(wsR)
                If wsR.Cells(s, R_PART).Value = partId And wsR.Cells(s, R_TOUR).Value = tour Then existe = True: Exit For
            Next s
            If Not existe Then
                s = DerniereLigne(wsR) + 1
                rm = TrouverLigne(wsM, 1, wsP.Cells(r, P_MEMBRE).Value)
                wsR.Cells(s, R_ID).Value = ProchainId(wsR)
                wsR.Cells(s, R_PART).Value = partId
                wsR.Cells(s, R_CODE).Value = wsP.Cells(r, P_CODE).Value
                wsR.Cells(s, R_TOUR).Value = tour
                wsR.Cells(s, R_NOM).Value = wsP.Cells(r, P_NOM).Value
                wsR.Range(wsR.Cells(s, R_TEL), wsR.Cells(s, R_CNI)).NumberFormat = "@"
                If rm > 0 Then
                    wsR.Cells(s, R_TEL).Value = CStr(wsM.Cells(rm, M_TEL).Value)
                    wsR.Cells(s, R_CNI).Value = CStr(wsM.Cells(rm, M_CNI).Value)
                End If
                wsR.Cells(s, R_MONTANT).Value = mise * NB_POS * wsP.Cells(r, P_QUARTS).Value / QUARTS_CASE
                wsR.Cells(s, R_MONTANT).NumberFormat = FMT_FCFA
                wsR.Cells(s, R_REF).NumberFormat = "@"
            End If
        End If
    Next r
End Sub

' Après une permutation touchant le tour courant : supprime les lignes « à remettre » de ce tour et les recrée
Private Sub RecalerRemisesTourCourant(ByVal gid As Long)
    Dim wsR As Worksheet, rg As Long, tour As Long, code As String, s As Long
    rg = TrouverLigne(Feuille(F_GROUPES), G_ID, gid)
    If Feuille(F_GROUPES).Cells(rg, G_STATUT).Value <> "EN_COURS" Then Exit Sub
    tour = Feuille(F_GROUPES).Cells(rg, G_TOUR).Value
    code = CodeGroupe(gid)
    Set wsR = Feuille(F_REMISES)
    For s = DerniereLigne(wsR) To 2 Step -1
        If wsR.Cells(s, R_CODE).Value = code And wsR.Cells(s, R_TOUR).Value = tour And wsR.Cells(s, R_MODE).Value = "" Then
            wsR.Rows(s).Delete
        End If
    Next s
    GenererRemises gid, tour
End Sub

Private Function TourDejaRemis(ByVal gid As Long, ByVal tour As Long) As Boolean
    Dim wsR As Worksheet, s As Long, code As String
    Set wsR = Feuille(F_REMISES)
    code = CodeGroupe(gid)
    For s = 2 To DerniereLigne(wsR)
        If wsR.Cells(s, R_CODE).Value = code And wsR.Cells(s, R_TOUR).Value = tour And wsR.Cells(s, R_MODE).Value <> "" Then
            TourDejaRemis = True: Exit Function
        End If
    Next s
End Function

Private Function LotsNonRemis(ByVal code As String, ByVal tour As Long) As Long
    Dim wsR As Worksheet, s As Long
    Set wsR = Feuille(F_REMISES)
    For s = 2 To DerniereLigne(wsR)
        If wsR.Cells(s, R_CODE).Value = code And wsR.Cells(s, R_TOUR).Value = tour And wsR.Cells(s, R_MODE).Value = "" Then
            LotsNonRemis = LotsNonRemis + 1
        End If
    Next s
End Function

'=====================================================================
'  FONCTIONS UTILITAIRES
'=====================================================================
Private Function Feuille(ByVal nom As String) As Worksheet
    Set Feuille = ThisWorkbook.Worksheets(nom)
End Function

Private Sub PreparerFeuille(ByVal nom As String, entetes As Variant)
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(nom)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = nom
    End If
    If IsArray(entetes) Then
        If ws.Range("A1").Value = "" Then
            ws.Range(ws.Cells(1, 1), ws.Cells(1, UBound(entetes) + 1)).Value = entetes
        End If
        StyleEntete ws.Range(ws.Cells(1, 1), ws.Cells(1, UBound(entetes) + 1))
        ws.Range(ws.Cells(1, 1), ws.Cells(1, UBound(entetes) + 1)).EntireColumn.ColumnWidth = 15
        ws.Activate
        ActiveWindow.FreezePanes = False
        ws.Range("A2").Select
        ActiveWindow.FreezePanes = True
    End If
End Sub

Private Sub StyleEntete(rng As Range)
    rng.Font.Bold = True
    rng.Font.Color = RGB(255, 255, 255)
    rng.Interior.Color = RGB(29, 95, 58)
    rng.HorizontalAlignment = xlCenter
End Sub

Private Sub AjouterBouton(ws As Worksheet, ancre As Range, ByVal largeur As Double, ByVal texte As String, ByVal macro As String)
    Dim b As Object, i As Long
    For i = ws.Buttons.Count To 1 Step -1          ' supprime l'ancien bouton (réinstallation)
        If ws.Buttons(i).OnAction Like "*" & macro Then ws.Buttons(i).Delete
    Next i
    Set b = ws.Buttons.Add(ancre.Left, ancre.Top, largeur, 24)
    b.OnAction = macro
    b.Caption = texte
End Sub

Private Function DerniereLigne(ws As Worksheet) As Long
    DerniereLigne = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
End Function

Private Function ProchainId(ws As Worksheet) As Long
    ProchainId = Application.WorksheetFunction.Max(ws.Columns(1)) + 1
End Function

Private Function TrouverLigne(ws As Worksheet, ByVal col As Long, ByVal valeur As Variant) As Long
    Dim r As Long, cible As String
    cible = CStr(valeur)
    For r = 2 To DerniereLigne(ws)
        If CStr(ws.Cells(r, col).Value) = cible Then TrouverLigne = r: Exit Function
    Next r
    TrouverLigne = 0
End Function

Private Function DejaChoisi(tableau() As Long, ByVal n As Long, ByVal valeur As Long) As Boolean
    Dim i As Long
    For i = 1 To n
        If tableau(i) = valeur Then DejaChoisi = True: Exit Function
    Next i
End Function

Private Function MiseReference() As Double
    Dim v As Double
    v = Val(CStr(Feuille(F_PARAM).Range("B2").Value))
    If v <= 0 Then v = 100000
    MiseReference = v
End Function

Private Function QuartsDeFormule(ByVal libelle As String) As Long
    Dim r As Long
    With Feuille(F_PARAM)
        For r = 2 To 4
            If .Cells(r, 4).Value = libelle Then QuartsDeFormule = .Cells(r, 5).Value: Exit Function
        Next r
    End With
End Function

Private Function Occupation(ByVal gid As Long) As Variant
    Dim o(1 To 10) As Long, ws As Worksheet, r As Long, p As Long
    Set ws = Feuille(F_PARTS)
    For r = 2 To DerniereLigne(ws)
        If CLng(ws.Cells(r, P_GROUPE).Value) = gid Then
            p = ws.Cells(r, P_POS).Value
            If p >= 1 And p <= NB_POS Then o(p) = o(p) + ws.Cells(r, P_QUARTS).Value
        End If
    Next r
    Occupation = o
End Function

Private Function MembreDansGroupe(ByVal membreId As Long, ByVal gid As Long) As Boolean
    Dim ws As Worksheet, r As Long
    Set ws = Feuille(F_PARTS)
    For r = 2 To DerniereLigne(ws)
        If CLng(ws.Cells(r, P_MEMBRE).Value) = membreId And CLng(ws.Cells(r, P_GROUPE).Value) = gid Then
            MembreDansGroupe = True: Exit Function
        End If
    Next r
End Function

Private Function CreerGroupe(ByVal mise As Double) As Long
    Dim ws As Worksheet, r As Long, n As Long, code As String, id As Long
    Set ws = Feuille(F_GROUPES)
    n = DerniereLigne(ws)              ' = nombre de groupes + 1
    Do
        code = "G" & Format(n, "000")
        If TrouverLigne(ws, G_CODE, code) = 0 Then Exit Do
        n = n + 1
    Loop
    r = DerniereLigne(ws) + 1
    id = ProchainId(ws)
    ws.Cells(r, G_ID).Value = id
    ws.Cells(r, G_CODE).Value = code
    ws.Cells(r, G_MISE).Value = mise
    ws.Cells(r, G_MISE).NumberFormat = FMT_FCFA
    ws.Cells(r, G_TOUR).Value = 1
    ws.Cells(r, G_STATUT).Value = "OUVERT"
    ws.Cells(r, G_CREA).Value = Date
    ws.Cells(r, G_CREA).NumberFormat = "dd/mm/yyyy"
    CreerGroupe = id
End Function

Private Sub AjouterPart(ByVal membreId As Long, ByVal gid As Long, ByVal pos As Long, ByVal quarts As Long)
    Dim ws As Worksheet, r As Long, rm As Long
    Set ws = Feuille(F_PARTS)
    r = DerniereLigne(ws) + 1
    rm = TrouverLigne(Feuille(F_MEMBRES), 1, membreId)
    ws.Cells(r, P_ID).Value = ProchainId(ws)
    ws.Cells(r, P_MEMBRE).Value = membreId
    ws.Cells(r, P_GROUPE).Value = gid
    ws.Cells(r, P_POS).Value = pos
    ws.Cells(r, P_QUARTS).Value = quarts
    ws.Cells(r, P_DATE).Value = Date
    ws.Cells(r, P_DATE).NumberFormat = "dd/mm/yyyy"
    ws.Cells(r, P_NOM).Value = Feuille(F_MEMBRES).Cells(rm, 2).Value & " " & Feuille(F_MEMBRES).Cells(rm, 3).Value
    ws.Cells(r, P_CODE).Value = CodeGroupe(gid)
End Sub

Private Function CodeGroupe(ByVal gid As Long) As String
    Dim r As Long
    r = TrouverLigne(Feuille(F_GROUPES), G_ID, gid)
    If r > 0 Then CodeGroupe = Feuille(F_GROUPES).Cells(r, G_CODE).Value
End Function

Private Function TourDuGroupe(ByVal code As String) As Long
    Dim r As Long
    r = TrouverLigne(Feuille(F_GROUPES), G_CODE, code)
    If r > 0 Then TourDuGroupe = Feuille(F_GROUPES).Cells(r, G_TOUR).Value
End Function

' Groupe choisi en Gestion_Groupes!C1 (0 si aucun)
Private Function GroupeActif(ByVal avertir As Boolean) As Long
    Dim code As String, r As Long
    code = Trim$(CStr(Feuille(F_GESTION).Range(GG_CELLULE_GROUPE).Value))
    If code <> "" Then r = TrouverLigne(Feuille(F_GROUPES), G_CODE, code)
    If r > 0 Then
        GroupeActif = Feuille(F_GROUPES).Cells(r, G_ID).Value
    ElseIf avertir Then
        MsgBox "Choisissez d'abord un groupe dans Gestion_Groupes, cellule " & GG_CELLULE_GROUPE & ".", vbExclamation
        Feuille(F_GESTION).Activate
        Feuille(F_GESTION).Range(GG_CELLULE_GROUPE).Select
    End If
End Function
