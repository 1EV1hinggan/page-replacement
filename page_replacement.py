def simulate(algorithm, refs, n_frames):
    frames = [None] * n_frames
    load_time = {}                      # page -> step when it entered (FIFO)
    last_used = {}                      # page -> step of latest access (LRU)
    hits, faults = 0, 0

    for i, page in enumerate(refs):
        if page in frames:
            hits += 1
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
            else:
                idx, why = choose_victim(algorithm, frames, refs, i,
                                         load_time, last_used)
            frames[idx] = page
            load_time[page] = i
        last_used[page] = i

    return hits, faults


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


print(simulate("FIFO", [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], 3))
print(simulate("LRU", [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], 3))
print(simulate("Optimal", [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], 3))