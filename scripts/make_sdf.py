#!/usr/bin/env python3
"""Build data/prototype.sdf from the Phase 0 tables in prototype-plan.md."""
import argparse
import sys
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import AllChem, Crippen, Descriptors, Lipinski, rdMolDescriptors

ROOT = Path(__file__).resolve().parent.parent

FAMILY = {
    "A": "anilinoquinazoline",
    "B": "benzenesulfonamide",
    "C": "N-arylpiperazine",
}

# Assay target per series. Potencies below are ILLUSTRATIVE demo values, not
# literature measurements; None = not yet tested (shown as an unlit crystal).
TARGET = {
    "A": "EGFR kinase",
    "B": "Carbonic anhydrase II",
    "C": "5-HT1A receptor",
}
PIC50 = {
    "A1": 6.1, "A2": 7.3, "A3": 7.9, "A4": 7.5, "A5": None,
    "B1": 5.2, "B2": None, "B3": 5.6, "B4": None, "B5": 4.8,
    "C1": 6.0, "C2": 7.1, "C3": None, "C4": 6.6, "C5": None,
}

# (ID, substitution, SMILES)
COMPOUNDS = [
    ("A1", "H", "COc1cc2ncnc(Nc3ccccc3)c2cc1OC"),
    ("A2", "3-Cl", "COc1cc2ncnc(Nc3cccc(Cl)c3)c2cc1OC"),
    ("A3", "3-Cl,4-F", "COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OC"),
    ("A4", "3-Br", "COc1cc2ncnc(Nc3cccc(Br)c3)c2cc1OC"),
    ("A5", "3-ethynyl", "COc1cc2ncnc(Nc3cccc(C#C)c3)c2cc1OC"),
    ("B1", "H", "NS(=O)(=O)c1ccccc1"),
    ("B2", "4-Me", "Cc1ccc(S(N)(=O)=O)cc1"),
    ("B3", "4-Cl", "NS(=O)(=O)c1ccc(Cl)cc1"),
    ("B4", "4-OMe", "COc1ccc(S(N)(=O)=O)cc1"),
    ("B5", "4-NH2", "Nc1ccc(S(N)(=O)=O)cc1"),
    ("C1", "H", "C1CN(CCN1)c1ccccc1"),
    ("C2", "2-OMe", "COc1ccccc1N1CCNCC1"),
    ("C3", "3-Cl", "Clc1cccc(N2CCNCC2)c1"),
    ("C4", "3-CF3", "FC(F)(F)c1cccc(N2CCNCC2)c1"),
    ("C5", "4-F", "Fc1ccc(N2CCNCC2)cc1"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "data" / "prototype.sdf"))
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    writer = Chem.SDWriter(str(out))
    failed = []
    for cid, change, smi in COMPOUNDS:
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            failed.append(cid)
            continue
        AllChem.Compute2DCoords(mol)
        series = cid[0]
        name = f"{change} {FAMILY[series]}" if change != "H" else f"parent {FAMILY[series]}"
        mol.SetProp("_Name", cid)
        mol.SetProp("ID", cid)
        mol.SetProp("SERIES", series)
        mol.SetProp("NAME", name)
        mol.SetProp("MW", f"{Descriptors.MolWt(mol):.2f}")
        mol.SetProp("cLogP", f"{Crippen.MolLogP(mol):.2f}")
        mol.SetProp("TPSA", f"{rdMolDescriptors.CalcTPSA(mol):.1f}")
        mol.SetProp("HBD", str(Lipinski.NumHDonors(mol)))
        mol.SetProp("HBA", str(Lipinski.NumHAcceptors(mol)))
        mol.SetProp("TARGET", TARGET[series])
        if PIC50[cid] is not None:
            mol.SetProp("pIC50", f"{PIC50[cid]:.1f}")
            mol.SetProp("ACTIVITY_SOURCE", "illustrative")
        writer.write(mol)
        print(f"{cid:3s} {name:32s} MW={mol.GetProp('MW'):>7s} cLogP={mol.GetProp('cLogP'):>5s} "
              f"TPSA={mol.GetProp('TPSA'):>5s} HBD={mol.GetProp('HBD')} HBA={mol.GetProp('HBA')}")
    writer.close()
    if failed:
        print(f"ERROR: failed to parse SMILES for {failed}", file=sys.stderr)
        return 1
    print(f"Wrote {len(COMPOUNDS)} records to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
