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


refs, frames = parse_input("7 0 1 2 0 3 0 4 2 3 0 3 2 1 2 0 1 7 0 1", "3")
print(format_trace(simulate("FIFO", refs, frames), frames))