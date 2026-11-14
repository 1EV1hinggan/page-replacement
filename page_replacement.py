def simulate(refs, n_frames):
    frames = [None] * n_frames
    load_time = {}                      # page -> step when it entered (FIFO)
    hits, faults = 0, 0

    for i, page in enumerate(refs):
        if page in frames:
            hits += 1
        else:
            faults += 1
            if None in frames:
                idx = frames.index(None)
            else:
                idx = min(range(len(frames)), key=lambda k: load_time[frames[k]])
            frames[idx] = page
            load_time[page] = i

    return hits, faults


print(simulate([7, 0, 1, 2, 0, 3, 0, 4], 3))