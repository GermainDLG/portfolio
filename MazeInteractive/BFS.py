import copy
from collections import deque

"""" 
This is my implementation of BFS for my pathfinding interactive. It works with
BFSRound, which will run one iteration of BFS, and fullBFS, which will run the
whole search algorithm. BFSRound will take every node in the frontier, set it
to explored in blockDict, and then check all 4 directions (up, down, left, right),
and add those positions to the frontier if they are valid (i.e. in bounds, have
not been explored, are not an obstacle, and are not already in the frontier.)
There is also FullBFS which completes the same action, however it has a while
loop over the frontier to check if it is empty. While it is not empty and we
have not found the goal, we keep expanding outwards.

By: Davis Germain <dgermain@andrew.cmu.edu>
"""

"""
in_bounds, isnt_explored, isnt_obstacle, isnt_in_frontier, and is_valid are all
functions used to check if a given block is a valid block to put on the frontier.
They return boolean values after their function names.
"""
def in_bounds(x,y):
    return 0 <= x < 950 and 0 <= y < 800

def isnt_explored(blockDict, x,y):
    return (x,y) not in blockDict["Explored"]

def isnt_obstacle(blockDict, x,y):
    return (x,y) not in blockDict["Obstacle"]

def isnt_in_frontier(blockDict, x, y):
    return (x,y) not in blockDict["Frontier"]

def is_valid(blockDict, coord):
    x, y = coord
    return (in_bounds(x,y) and isnt_explored(blockDict, x,y) 
            and isnt_obstacle(blockDict, x,y) and isnt_in_frontier(blockDict, x,y))

"""
BFSRound takes in the blockDict and parent path if applicable. It runs a
single "round" of BFS, incrementing the frontier forward by one space and 
adding to the parent path. It either returns GOAL or None.
"""
def BFSRound(blockDict, parent=None):
    directions = [(-50,0), (50,0), (0,-50), (0,50)]
    tmpFrontier = copy.deepcopy(blockDict["Frontier"])
    blockDict["Frontier"] = []

    for oldCoord in tmpFrontier:
        blockDict["Explored"].append(oldCoord)

        # Check if we reached the goal
        if oldCoord == tuple(blockDict["Goal"]):
            return "GOAL"

        for dr, dc in directions:
            newCoord = (oldCoord[0]+dr, oldCoord[1]+dc)
            if is_valid(blockDict, newCoord):
                blockDict["Frontier"].append(newCoord)
                if parent is not None:
                    parent[newCoord] = oldCoord  # track BFS path

    return None

"""
reconstruct_path takes the parent path, the start, and the goal, and traces
down the path taken by the algorithm through parent. Once it has reconstructed
the path, it returns it.
Note: This function appears in Greedy.py exactly the same and AStar.py differently.
This was done for clarity to understand which reconstruction was happening.
"""
def reconstruct_path(parent, start, goal):
    path = [goal]
    current = goal
    while current != start:
        current = parent.get(current)
        if current is None:
            return None  # no path found
        path.append(current)
    path.reverse()
    return path

"""
fullBFS repeatedly runs the BFS algorithm and adds each iteration to a queue. 
While this queue is not empty, we still have more to explore and we perform 
another round of BFS. Note: this function does not call BFSRound. It follows
its own queue-based structure. It either returns the path the the goal from
start or None.
"""
def fullBFS(blockDict):
    start = tuple(blockDict["Start"])
    goal = tuple(blockDict["Goal"])
    directions = [(-50,0), (50,0), (0,-50), (0,50)]

    queue = deque()
    queue.append([start])
    visited = set([start])

    while queue:
        path = queue.popleft()
        r, c = path[-1]

        if (r, c) == goal:
            return path

        for dr, dc in directions:
            newPos = (r + dr, c + dc)
            if (in_bounds(*newPos) and newPos not in visited and newPos not in blockDict["Obstacle"]):
                visited.add(newPos)
                newPath = path + [newPos]
                queue.append(newPath)

    return None