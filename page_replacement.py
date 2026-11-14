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
            elif algorithm == "FIFO":
                idx = min(range(len(frames)), key=lambda k: load_time[frames[k]])
            elif algorithm == "LRU":
                idx = min(range(len(frames)), key=lambda k: last_used[frames[k]])
            else:
                # Optimal: look at upcoming references after the current one
                future = refs[i + 1:]
                idx, best_dist = 0, -1
                for k, p in enumerate(frames):
                    dist = future.index(p) if p in future else float("inf")
                    if dist > best_dist:        # strict '>' keeps the lowest frame on ties
                        idx, best_dist = k, dist
            frames[idx] = page
            load_time[page] = i
        last_used[page] = i

    return hits, faults


print(simulate("FIFO", [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], 3))
print(simulate("LRU", [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], 3))
print(simulate("Optimal", [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1], 3))