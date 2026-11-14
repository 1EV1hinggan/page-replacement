def simulate(refs, n_frames):
    frames = [None] * n_frames
    hits, faults = 0, 0

    for page in refs:
        if page in frames:
            hits += 1
        else:
            faults += 1
            if None in frames:
                frames[frames.index(None)] = page

    return hits, faults


print(simulate([7, 0, 1, 2, 0, 3, 0, 4], 3))