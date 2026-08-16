"""Convert OR-Library thpack/BR files to LoadPlan CSVs.
Usage: python thpack_to_csv.py thpack1.txt outdir/
Format: see people.brunel.ac.uk/~mastjjb/jeb/orlib/thpackinfo.html"""
import sys, os, csv
def convert(path, outdir):
    tok = open(path).read().split()
    i = 0; P = int(tok[i]); i += 1
    for p in range(P):
        pno = int(tok[i]); i += 1
        # thpack1-7 have a seed after problem number; thpack8/9 do not.
        # Heuristic: if next token is huge it is a seed.
        if int(tok[i]) > 10000: i += 1
        L, W, H = int(tok[i]), int(tok[i+1]), int(tok[i+2]); i += 3
        n = int(tok[i]); i += 1
        rows = []
        for t in range(n):
            _, bl, o1, bw, o2, bh, o3, qty = (int(tok[i+k]) for k in range(8)); i += 8
            rows.append([f"T{t+1}", bl, bw, bh, round(bl*bw*bh/1e6*200,1), qty, "no"])
        with open(os.path.join(outdir, f"{os.path.basename(path)}_p{pno}.csv"), "w", newline="") as f:
            w = csv.writer(f); w.writerow(["name","length_cm","width_cm","height_cm","weight_kg","qty","fragile"]); w.writerows(rows)
    print(f"{P} problems converted; container {L}x{W}x{H}")
if __name__ == "__main__": convert(sys.argv[1], sys.argv[2] if len(sys.argv)>2 else ".")
