ALGORITHMS = ("FIFO", "LRU", "Optimal")


def parse_input(ref_text, frame_text):
    tokens = ref_text.replace(",", " ").replace("-", " ").split()
    if not tokens:
        raise ValueError("Reference string is empty.")
    refs = []
    for t in tokens:
        if not t.lstrip("+").isdigit():
            raise ValueError(f"Invalid page '{t}': pages must be whole numbers >= 0.")
        refs.append(int(t))
    try:
        frames = int(frame_text)
    except (TypeError, ValueError):
        raise ValueError("Number of frames must be a whole number.")
    if frames < 1:
        raise ValueError("Number of frames must be at least 1.")
    if frames > 10:
        raise ValueError("Maximum of 10 frames is supported.")
    return refs, frames


def simulate(algorithm, refs, n_frames):
    frames = [None] * n_frames          # frame contents, index 0 = F1
    load_time = {}                      # page -> step when it entered (FIFO)
    last_used = {}                      # page -> step of latest access (LRU)
    steps, hits, faults = [], 0, 0

    for i, page in enumerate(refs):
        if page in frames:                                  # ---- HIT
            hits += 1
            result = "HIT"
            idx = frames.index(page)
            note = f"{page} is inside F{idx + 1}, copy"
        else:                                               # ---- FAULT
            faults += 1
            result = "FAULT"
            if None in frames:
                idx = frames.index(None)
                note = f"{page} is not inside, insert into F{idx + 1}"
            else:
                idx, why = choose_victim(algorithm, frames, refs, i,
                                         load_time, last_used)
                old = frames[idx]
                note = (f"{page} is not inside, no free frame, "
                        f"replace {old} in F{idx + 1} ({why})")
            frames[idx] = page
            load_time[page] = i
        last_used[page] = i
        steps.append({"ref": page, "frames": list(frames),
                      "result": result, "note": note})

    return {"algorithm": algorithm, "steps": steps, "hits": hits,
            "faults": faults, "final": list(frames), "total": len(refs)}


def choose_victim(algorithm, frames, refs, i, load_time, last_used):
    if algorithm == "FIFO":
        idx = min(range(len(frames)), key=lambda k: load_time[frames[k]])
        return idx, "oldest arrival"

    if algorithm == "LRU":
        idx = min(range(len(frames)), key=lambda k: last_used[frames[k]])
        return idx, "least recently used"

    # Optimal: look at upcoming references after the current one
    future = refs[i + 1:]
    best_idx, best_dist = 0, -1
    for k, p in enumerate(frames):
        dist = future.index(p) if p in future else float("inf")
        if dist > best_dist:                # strict '>' keeps the lowest frame on ties
            best_idx, best_dist = k, dist
    why = "never used again" if best_dist == float("inf") \
        else f"next use in {best_dist + 1} reference(s)"
    return best_idx, why


def format_trace(res, n_frames):
    head = f"{'Step':<5}{'Ref':<5}" + "".join(f"{'F' + str(k + 1):<5}" for k in range(n_frames)) \
           + f"{'Result':<8}Explanation"
    lines = [head, "-" * len(head)]
    for n, s in enumerate(res["steps"], 1):
        cells = "".join(f"{('' if p is None else p):<5}" for p in s["frames"])
        lines.append(f"{n:<5}{s['ref']:<5}{cells}{s['result']:<8}{s['note']}")
    return "\n".join(lines)


def format_summary(res):
    total = res["total"]
    hr = res["hits"] / total * 100
    fr = res["faults"] / total * 100
    final = ", ".join("-" if p is None else str(p) for p in res["final"])
    return (f"Final frames : [{final}]\n"
            f"Total hits   : {res['hits']}  ({hr:.2f}%)\n"
            f"Total faults : {res['faults']}  ({fr:.2f}%)\n"
            f"Hit/Fault ratio : {res['hits']}:{res['faults']}"
            f"  ({res['hits'] / res['faults']:.2f})" if res["faults"]
            else f"Final frames : [{final}]\nTotal hits : {res['hits']} (100%)\nTotal faults : 0")


def format_comparison(results):
    lines = [f"{'Algorithm':<12}{'Hits':<8}{'Faults':<8}{'Hit %':<9}{'Fault %':<9}"]
    lines.append("-" * 46)
    for r in results:
        t = r["total"]
        lines.append(f"{r['algorithm']:<12}{r['hits']:<8}{r['faults']:<8}"
                     f"{r['hits'] / t * 100:<9.2f}{r['faults'] / t * 100:<9.2f}")
    fewest = min(r["faults"] for r in results)
    best = [r["algorithm"] for r in results if r["faults"] == fewest]
    lines.append("")
    lines.append(f"Fewest page faults: {', '.join(best)} ({fewest}).")
    lines.append("Optimal is the theoretical minimum (needs future knowledge); "
                 "LRU approximates it; FIFO ignores usage and can suffer Belady's anomaly.")
    return "\n".join(lines)


def full_report(refs, n_frames, selected=ALGORITHMS):
    out = [f"Reference string : {' '.join(map(str, refs))}",
    f"Number of frames : {n_frames}", ""]
    results = []
    for name in selected:
        r = simulate(name, refs, n_frames)
        results.append(r)
        out += [f"===== {name} =====", format_trace(r, n_frames), "",
    format_summary(r), ""]
    if len(results) > 1:
        out += ["===== COMPARISON =====", format_comparison(results)]
    return "\n".join(out)


def run_cli():
    print("=" * 40, "\nPAGE REPLACEMENT SIMULATOR\n" + "=" * 40, sep="")
    while True:
        print("\n1. FIFO\n2. LRU\n3. Optimal\n4. Compare All\n5. Exit")
        c = input("Select: ").strip()
        if c == "5":
            break
        if c not in "1234" or c == "":
            print("Invalid choice.")
            continue
        try:
            refs, n = parse_input(input("Reference string (e.g. 7 0 1 2 0 3): "),
                                  input("Number of frames: "))
        except ValueError as e:
            print("Error:", e)
            continue
        sel = ALGORITHMS if c == "4" else (ALGORITHMS[int(c) - 1],)
        print("\n" + full_report(refs, n, sel))


TEST_CASES = [
    # (name, reference string, frames, expected faults FIFO/LRU/Optimal)
    ("Test 1 - Textbook string, 3 frames",
     "7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1", 3, (15, 12, 9)),
    ("Test 2 - Belady string, 3 frames",
     "1 2 3 4 1 2 5 1 2 3 4 5", 3, (9, 10, 7)),
    ("Test 3 - Reviewer example, 7 frames",
     "1 2 4 5 3 6 7 2 3 1 8 9", 7, (9, 9, 9)),
]


for name, ref, n, exp in TEST_CASES:
    print(name, "->", exp)