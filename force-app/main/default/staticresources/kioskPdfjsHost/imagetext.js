/*
 * Read words from a ruled table that was stored as a picture in the PDF.
 * Real PDF text is unchanged. A picture with no ruled grid is ignored.
 * Templates are shapes of common sans-serif letters, so this is not tied
 * to one PRT file. Coordinates are fractions of the image, origin top-left.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.imageText = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var CW = 16;
    var CH = 22;
    var MIN_GLYPH = 0.68;
    var MIN_WORD = 0.78;
    var TEMPLATE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-()./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-()./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-()./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-()./";
    var TEMPLATE_BITS = "AAAAAAAAA8ADwAfgB+AP8A5wDnAceBw4HDg//D/8eB5wDnAO8A8AAAAAAAAAAP/g//j//P/+8B7wHvAe8Dz//P/4//7wHvAP8A/wD/Af//7//v/8AAAAAAAAAAAP+B/8P/58HngP8AjwAPAA8ADwAPAA8AjwD/gPeB4//h/8D/AAAAAAAAD/wP/4//z//PA+8B7wD/AP8A/wD/AP8A/wD/AP8B7wPv/8//j/8AAAAAAAAP/+//7//vAA8ADwAPAA8AD//v/+//7wAPAA8ADwAPAA8AD///////8AAP//////////+AD4APgA+AD4AP/8//z//P/8+AD4APgA+AD4APgA+AD4APgAAAAAAAPgD/g//nw+eA5wDvAA8ADwAPB/8H/wD3APeA98Pz/+D/wD4AAAAAAAAPAP8A/wD/AP8A/wD/AP8A/////////wD/AP8A/wD/AP8A/wD/AP8A8AAAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4APgg+eD58Pnw+f/w//B/wD+AAAAAA8B7wPPB48Pjx4PPg98D/gP/A/+D94Pjw8PjwePB88D7wHvAfAAAAAPgA+AD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4AP//////////AAAAAAAA+B/8P/w//D/8P+w/7nfud+535+fn5+fn4+fjx+PH48cAAAAAAAAAAPAP+A/8D/wP/g/+D/8P/4/3j/fP88/x7/H/8P/wf/B/8D/wP/Af8A8AAAAAAAAAAA/4H/h8PHgecA/gD+AH4AfgB+AH4A/wD3gefD4f+B/4AAAAAAAAAAD/+P/+//7wP/Af8A/wD/Af8D///v/+//j/wPAA8ADwAPAA8ADwAPAAAAAAAAAAD/Af+D/8eD7wHvAO4A7gDuAO4A7gDvCOcf58fD/8H/8HzwACAAAAAAAAAAD/8P/4//zwPPAe8B7wHvA8//j/8PPg8fDw+PB48HzwPvAe8B8AAAAAAAAP8D/4P/x8PnAecB54AH+AP/Af/A/+Af4AH/AP8A/4D3w+f/4//A/wAAAAAP//////////A8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAAAAA8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP+B98Pn/+P/wP8AAAAAAAAPAP8A94DngeOBw4HDw8PDweOB54DnAPcA/wB+AH4AfgA8ADwAAAAAAAAAAAAAAAAAAA48fjx2PGY8Z35nZudm4+fD48PDwcOBw4AAAAAAAAAAAAAAAAAAD4Hng+PDw8PB54D/AP4AfgA8AHwAfgD/Ae8D54PDx8PHge8A8AAAAAAAAAAPAPeB54Hjw8HjweeA/wB/AH4APAA8ADwAPAA8ADwAPAA8ADwAAAAAAAAH/+f/5//n/+ADwAfAD4AfAD4AfAB8APgB8APgB8AHgA+AD///////8AAAAAAAAH4D/8P/x+fng+OB4APgH+H/5//vwe+B74Pvg++H7//n/fHwAAAAAA8ADwAPAA8ADwAPAA8/j3+P/8/D74HvAe8B7wH/Ae8B74Hvw+/D7//Pf48/AAAAAAB+Af+D/8f/58H/gf+AD4APgA+AD4APgc+B/8H3/+P/wf/AfgAAAAAAAPAA8ADwAPAA8ADx/PH+9//3w/+B/4H/Af8A/wH/Af+B98P3w/P/8f7w+PAAAAAAfgH/g//H9+fD74H/gf+B//////+AD4APgcfB9+fj/8H/gP4AAAAAAB+AP4B/gHwAeAB4Af8B/wH/AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgA/OH+4//n4+eB54HngeeA54DngeeB58Hj/+P/4f/g+eAB54HnweP/4//A/weAB4AHgAeAB4AHgAe/h//H/+fD54HngeeB54HngeeB54HngeeB54HngeeB4DwAPAA8ADwAAAAAADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwADgAOAA4AAAAAAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4AHgA+AH4AeAeAB4AHgAeAB4AHgAeD54fHj4efB74H/Af8B/wH/gffB48Hj4eHh4PHg+eB4DwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAAAAAAAAAAAAAAOHP++///jx+HH4Yfhh+GH4Yfhh+GH4YcAAAAAAAAAAAAAAAAAAAHw9/z3/v///B/4H/gf+B/4H/gf+B/4H/gf+B/4H/gf+B/4HwAAAAAAAAAAAAAH8B/4P/x8Pngf8B/wD/AP8A/wD/AP+B98Pj/8H/gP8AAAAAAAAPHw9/j3/Pw+/D/4H/gf+B/4H/gf+B/4H/w+//z//Pv4+AD4APgA+AD4APgAD88f7z//fD98H/gf+B/4D/gP+B/4H3gffD8//x//H98AHwAfAB8AHwAfAB8AeHz+ff5//H/8f4h/AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AAAAAAAH4D/8P/x8fngeeBB/AH/gP/wf/gP/AD/4H/gf/D9//j/8B/AAAAAAAMABwAfAB8AHwAfAH/gf+B/4B8AHwAfAB8AHwAfAB8AHwAfAB8gD+AP4AfgAAAAA+B/4H/gf+B/4H/gf+B/4H/gf+B/4H/gf+B/4P///f+9/7x8AAAAAAAAAAAAAAPAP+B94HnwePD48PB48HngeeA5wD/AP8AfgB+ADwAPAAAAAAAAAAAAAAAAAAAAAAAAA48djxnPOc8437DZ8PnweeB54HDgAAAAAAAAAAAAAAAAAAAAAAAD4H3w8PHw++B/4H/AP4AfAB+AP4B/wH/g+fDx8eD74HwAAAAAAAPgP+B94HjwePBw8PB48HjweeA94D/gH8AfwB+AD4APgA8AHwAfAf4B/AD4AAAAAAH//f/9//3//AHwA/AH4A/AH4A/AH8AfgD8AfgD//////////wAAAAAH4A/wH/g+fDw8fD58Pnw+fB58HnwefB58HnwefB58Pnw+PD4+fB/4D/AP8AB4AHgA+AH4B/gf+B/4HngYeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4B/AP+D/+Pj58HnweeB4AHgAeAD4AfAD8AfgD8AfgD8AfgD8AP/5//n/+f/4H4B/wP/g8fDw8eDwAPAA8APwD8APwA/wAPAAeAB4AHngefD58Pj/8H/gP8AB4AHgA+AH4AfgD+Af4B/gPeB54PHg8eHh4+Hj//////////wB4AHgAeAB4H/wf/B/8P/w8ADwAPAA/8D/4f/x8fng+AB4AHgAfAB74Hng+fHw//B/4D/AH8A/4H/w+PDw+fBx4AHgAe/B/+H/8fD58HngeeB54HnwePB4+Ph/8D/gH8H/+f/5//n/+ADwAeAD4APAB8AHgA8ADwAPAB4AHgA+ADwAPAA8ADwAPAA8AD+Af+D/8Pnx4PHg8ODw8PD/4D/Af+D/8PDx4HngeeB54Hnw+fnw//B/4B+AP4B/wP/g+fHg+eD54HngeeB54Pnx+P/4f/g/eAB4AHng+PDw//D/4H/AH4AAAAAAAAAAAAAAAAAAA/////////////////////wAAAAAAAAAAAAAAAAAAAOAAwAHAAYADgAOAA4AHAAcABwAHAAcABwAHAAcAA4ADgAOAAYABwADAAOAGAAMAA4ABgAHAAcABwAHgAOAA4ADgAOAA4ADgAeABwAHAAcABgAOAAwAHAAAAAAAAAP//////////////////////////////////////////AAAAAAAAAHAAcABwAOAA4ADgAOABwAHAAcABwAGAA4ADgAOABwAHAAcABwAHAA4ADgAAAAAAAYADwAPAB8AG4AZgDHAMMAwwGBgYGD/8MAwwDHAOYAbgB8ADAAAAAP/g//D//OAe4A7gDuAO4A7gDv/4//j//OAO4AfgB+AH4AfgB+AO//7/+P/gAAAAAAfwH/g8HDAOYAbgAOAA4ADgAOAA4ADgAGAHYAdwDjgcH/gP8AAAAAAAAP/A//D//OAe4A7gBuAH4AfgB+AD4AfgB+AH4AfgBuAO4Bzh/P/4/8AAAP/+//7//uAA4ADgAOAA4ADgAP/+//7//uAA4ADgAOAA4ADgAOAA////////////////8ADwAPAA8ADwAPAA//z//P/88ADwAPAA8ADwAPAA8ADwAPAA8AAAAAAAB+AP/DwcMAZwBmAC4ADAAMAAwH/Af8ADYANwAzAHPh4P/AfwAAAAAAAA4AfgB+AH4AfgB+AH4AfgB////////+AH4AfgB+AH4AfgB+AH4AfgBwAAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwIHDgcOBw8OB/4D/AP4AAA4A/gHuA84HDg4OHA44DnAO8A/4D7gPHA4eDg8OBw4DjgPOAc4A7gBwAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAH/+f/4AAAAAAADgB/AP8A/YC9gb2BvcM8wzzDPGI8ZjxmPDQ8PDw8PBgwAAAAAAAAAA4APwA/gD+APcA9wDzgPHA8eDw4PBw8HjwOPAc8A7wDvAH8AfwA/ABwAAAAAAAAfAH/A8PHAcYAbgBsAHwAPAA8ADwAPAA2AGYAZwDjw8D/ADwAAAAAAAAP/4//7gHuAP4AfgB+AH4AfgD//+//z/+OAA4ADgAOAA4ADgAOAA4AAAAAAAAAAH4B/4ODxwDGAGwAbABsAHwAfAB8AG4AZghnDsODwf/AfnAAAAAAAAAAAAAP/w//jgHOAO4A7gDuAM4Bz/+P/g4ODgcOBw4DjgHOAc4A7gBwAAAAAAAA/wP/w4PHAOYAZgBnAAeAA/wA/4A/wAPgAPQAfgB+AHcAZ8Hj/8D/gAAAAA/////wGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAAAAADgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB3AOfB4//A/wAAAAAAAAwANgB2AGcAYwDDAMOBwYGBwYDDAMMAwwBmAGYANAA8ADwAGAAAAAAAAAAAAAAAAAAADBg8HDQ8JiQmJmJmQmZDQsNDwcOBgYGBgAAAAAAAAAAAAAAAAAAHAGMA44HBwYDjAOcAfgA8ADgAPAB+AO8A5wHDg4HDAMcA7gBwAAAAAAAAAA4AdwBjAMOBwcGAwwDnAGYAPAA8ABgAGAAYABgAGAAYABgAGAAAAAAAAAf/9//wAPAB4APAA4AHAA4AHgA8ADgAeADgAeADwAOABwAPAA/////wAAAAAAAA/wH/w4PngecA4ADgAOAD4f/j/ueA7wDuAO4B7gHvB+f+c/xwAAAABwAHAAcABwAHAAcAB38H/4fDx4HHAMcA5wDmAOcA5wDnAOcBx4HHw4f/B34AAAA/AP+B/8PD54DnAP8A7wAOAA4ADgAOAA8ATwB/APcA88Hh/8D/gH8AAAAA4ADgAOAA4ADgAOD+4f/jw+OB4wDnAOcA5wDnAOcA4wDjgOOB4cPg/+B+4AAAAAD/Af+DwceB5wD+AH4AfgB//////gAOAA4ATwD3gOPB4f+A/wAAAAAAD4A/gD0AMAAwADAB/gH+ADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAB+4f/hw+OB5wDnAOcA5wDnAOcA5wDnAOOB4efh/+B84ADmAOcAw8OB/4D+BwAHAAcABwAHAAcABz8Hf4fBx4HHgOcA5wDnAOcA5wDnAOcA5wDnAOcA5wDgGAAYABgAAAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAMAAwAAAAAAAAADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwAPAA4BwAHAAcABwAHAAcABwPHB4cOBx4HPAd4B/AH+Ae8BxwHDgcPBwcHA4cDxwHAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAAAAAAAAAAAAAN4+///hw8GDwYPBg8GDwYPBg8GDwYPBgwAAAAAAAAAAAAAAAAPg5/z//vwf+A/wD+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AcAAAAAAAAH4B/4P/x4HvAO8A/gB+AH4AfgB+AH4AfgB/AOeB4+fB/4B+AAAAAAY+Bn8Hw4eBxwHHAMcA5wDmAOcA5wDnAMeBx4OH/4d+BwAHAAcABwAHAAcAAH5g/mHD44HjgOMA5wDnAOcAZwDnAOMA44HhweH/4P7gAOAA4ADgAOAA4ADgBwOfw7/Dv4PwA+ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAAAAP8D/8f/54HvAO8A/4AH4Af8Af+Af+AP8AHwAH8AfwB/gPf34//B/4AAAAgAOAA4ADgAOAD+AP4A/gA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAPgAfAA8AAA4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4A/gD+AP8B/4P3//P+cPwAAAAAAAAOAH4AdwDnAOOBw4HBgcGBgcOBw4DnAOcAZgB+AH4APgA8ADwAAAAAAAAAAAAAAAAAAAwYPhg2PGY8ZjxiJENmw2bBRoHDgcOBwwAAAAAAAAAAAAAAAAAADwD3gePDw8OB54DvAP4AfAA8ADwAfgDvAeeBw4PDx4HnAO4AcAAAAAcA5wDjgMOBw4HBwYHDgcOA4wBmAGYAfgB+ADwAPAA8ADgAOAAwA/AD4APAAAAAAAf/5//n/+ABwAOAB4APAB4APAB4AHAB4AHAA8AHgA8f//////AAAAAAfgD/AcODgcOBwwDnAOcA5wDnAOcA5wDnAOcA5wDnAOcA44DDgcHDgP8A/gADAAMABwAfAD8A/wDnAIcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAH8A/4PDx4HnAOcA5wDgAOAB4AHAA4ADgA8AHgA8AHAA8AHAA4AHgAf/5//gfAH/AcODgccBxwHAAcABgAOAPwA/gAPAAeAA4ADgAOcA5wDngeHngf+AfgADgAOAB4APgB+AO4AzgHOA44DDgcODg4cDhwOP///////wA4ADgAOAA4ADgf/B/8H/wYABgAOAA4ADvgP/h//HgecB4ADgAOAA4ADnAOcA54Hjw4H/gP8AfwD/gePDgcOAxwDHAAYABj8G/4fDx4HnAOcA5wBnAGcA44DjgcHDwP+Afgf/5//n/+ABwAOABwAHAA4ADgAcABwAOAA4AHgAcABwAGAA4ADgAOAA4ADgAH4A/wHDg4HDgcMBw4HDgcHDgP8A/wPDw4HHAOYA5gDmAOcA54Hjw8H/gP8A/gH/A8ODgccBxwDGAOYA5gDnAOeB48Ph/2H+YADgAOAAxwHDAcOHgf8A/gAAAAAAAAAAAAAAAAAAAAAP///////////////wAAAAAAAAAAAAAAAAAAAAAAQADAAIABgAEAAwADAAMABwAGAAYABgAGAAYAAgADAAMAAQABgACAAMAAQAIAAwABAAGAAIAAwADAAMAA4ABgAGAAYABgAGAAwADAAMAAgAGAAQADAAIAAAAAAAAA//////////////////////////////////////////8AAAAAAAAAMABwAGAAYABgAGAAwADAAMABgAGAAYABgAMAAwADAAcABgAGAAYADgAMAAAAAAADwAfgB+AH4A7wDnAecBx4HDgcODg8P/w//H/+cB7wDvAP4A8AAAAA/+D/+P/48HzwPPA+8DzwPPB8//D/+P/88P7wH/Af8B/wH/A/8P7//P/4/+AB/A/+D/8//z4HfAB8AHgA+AD4APgA+AD4APgAeAB8AH4BfgM//x//D/4D/AAA/4D/8P/48PzwPvAe8B/wD/AP8A/wD/AP8B/wH/Ae8D7//P/4//B8AAAAP/w//D/8PAA8ADwAPAA8ADwAP/g/+D/4PAA8ADwAPAA8ADwAP/w//D/8P/w//D/8P/w8ADwAPAA8ADwAPAA//D/8P/w//DwAPAA8ADwAPAA8ADwAPAA8AAAAAfAP/h//P598AXwAeADwAPAA8P/w//AP8A/wD3gPfA8/vx//D/8B+AAAAADwD/AP8A/wD/AP8A/wD/AP////////8A/wD/AP8A/wD/AP8A/wD/APAAADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAB8A/wD/AP4A+A8B/wP/A+8Hzw+PD48fDz4PPA94D/gPfA98Dz4PPw8fjw+PB88HzwPvA/8B88ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA//D/8P/w//AAAAAAAAAAA8A/4H/gf/D/sN+437nfmZ+fn5+fnx+PH48fhhwAAAAAAAAAAAAB4B/wP/A/+D/8P7w/vD+eP58/jz+Pv4e/g9+D34P/gf+A/4D/gH+AOAAAAAAAAA8Af+D/8fD54HnAP8A/wD/AP8A/wD/AP8A54Hnw+P/wf+AfAAAAAAP/g//j//Ph++D74P/gf+B/4Pvg++H7//P/4/+D4APgA+AD4APgA+AD4APgAAAAAAAfAP/A++Hg8cBzwHOAc4BzgHOAc8BxwPHg4P/g//AeeAB8AAwAAAAD/8P/4//zwfvA+8D7wPvA+8D7//P/4//D/8PD48HjwfPA88D7wPvAf8B/wDwfwD/wf/D48fAx8AHwAfgA/gD/gH/AH/AH8AP4APgA+AD5gPnh8f/x/8B/gAAD///////8DwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAAAAAAPAP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/gffD4//D/8B+AAAAAAAADwB/APeA94DngeeB48HDw8PDweOB44DnAOcA9wB/AH4AfgA8AAAAAAAAAAAAAAAAAAAOGD48fjx2PGY8Zy5nZsNmw2bDx8HDgcOAAAAAAAAAAAAAAAAPgPeB98Hjw8PjweeA94D/AP8AfgB+AP8A/wHng+fDw8eD54Hvgf8A8AAAAA8A/4H3gePDw8PD58HngP8A/wD/AH4APAA8ADwAPAA8ADwAPAA8ADwAAAf/5//n/+AD4AfAB8APgB+AHwA+ADwAfAD8AfgB8AHgA8AHwA//7//v//f/4AAAfgP/h//H/+eD5AHwAfAB8D/x//f///H/gf+B/4H/g///9//z/vH44AAHgAeAB4AHgAeAB4AHjge/h//H/8fD54HngeeB54HngeeB54Pn58f/x3+HPwAfAH/h//P/8//34HfgB8APwA/AD8APwA/AD8APwAfgF+B3//P/8//x/+A/gAHgAeAB4AHgAeAB4Hng/eH/4//nw+eB54HngeeB54HngefD4+fj/+H+4PjgAAAAAH8B/8P/5+Pnwf+A/4D/////////gA+AD4AHwAfx8//x/+D/wAAAAAAfgB+AP4B8gHgAeAB4Af8B/4H/AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AP/h/+P/48eHg8eDx4PDx8H/g/8DvAeAB+AH/4H/4//ngeeB54Hn/+f/wf8HgAeAB4AHgAeAB4AHjgefh//H/8fj58HngeeB54HngeeB54HngeeB54HngeA8ADwAPAA8AAAAAAAYADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AB4AHgAeAAAAAAAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AfAB8AHgDwAPAA8ADwAPAA8ADwAPDw8eDz4PfA94D/AP8A/wD/gPfA88Dz4PHw8PDw8A8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAAAAAAAAAAAAABgzfvv//88fhx+HH4cfhx+HH4cfhx0GCAAAAAAAAAAAAAAAAAADx+Pf+//////wf+B/4H/gf+B/4H/gf+B/4H/gf+B/4H/gf+A8AAAAAAAAAAAAAH/gf/D/+fD/4H/gf8A/wD/AP8A/4H/gffD5//j/8H/gAAAAAAABx8Hf4f/x/fHw+eB54HngeeB54HngefD5+fH/8f/x58HgAeAB4AHgAeAB4AA+OH+4//j5+fD54HngeeB54HngeeB58Pj5+P/4//g+eAB4AHgAeAB4AHgAeADw8fD38P/w//D/kP4A/AD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4AHAAD4B/8P/x//H4c/AT8AP4Af4B/4D/4H/wD/gH+AH8AP8A+8H7//P/8f/gP4AeAB8AHwAfAH/g//D/8P/gHwAfAB8AHwAfAB8AHwAfAB8AHwAf8B/wD+AH4AAAAAPgf+B/4H/gf+B/4H/gf+B/4H/gf+B/4H/gf/D///3//f+8fhwAAAAAAAAAAAADwD/gP+B94Hnw+PD48PD48HngfeB/4D/AP8A/wD/AH4AAAAAAAAAAAAAAAAAAAAAAAAOPH48djxnPOc+537jZsPmw+eBw4AAAAAAAAAAAAAAAAAAAAAPgPfB5+Pj48P3wf+B/4D/AP8A/wD/gf+B78Pnx8fnw++D/wHwAAAAD4D/gfeB58HjwePDwePB54H3gfeA/4D/AH8AfgB+AD4APgA8AHwAeAB4APgH/+f/5//n/+f/4A/AD8AfgD8APwB+AP4A+AH4A/gD8AfwB+AP/+///////+B/Af+B/8Pnx8PngeeB54H/gf+B/4H/gf+B/4H/gfeB54Hnw+Pnw/+B/4D+ADwAfAH8B/wH/Ac8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwH/+f/5//g/gP/h//H/8cPwAfAB8AHwAfAD8APgB8APwB+AHwA+APwA+AHwAf/5//n/+D+A/+H/4efxgfAB8AHwAfAD4H/Af4B/4AfwAfgA+AD4APkB+cPx/+H/4P+AB+AH4A/gD+Ae4BzgPOB44HDg8ODw4eDhwOPA4////////ADgAOAA4ADgAOD/8P/w//D/4PAA8ADwAPAA/wD/4P/w//AB+AD4APgA+AD5APnD8f/h/+D/gA/gP/A/8Pww+AHwAeAB4AHnwf/h//H9+eD54HngeeB54Hnw+fn4//B/4D/B//n/+f/5//gA+ADwAfAB8APgA+ADwAfAB4APgA+AHwAfAB4APgB8AHwAfAAfwH/g//Hw+eB54HngefDw/eB/4D+AP+B/8PH54Hvgf+B/4Hnw+f/w/+B/wB/Af+D/8fnx8PngeeB54HngeeB5+fn/+P/4P3gAeAB4APgB8cPh/8H/wP8AAAAAAAAAAAAAAAAAAAAAAf/7//////////3/+AAAAAAAAAAAAAAAAAAAAAADgAMABwAGAA4ADgAOAA4AHAAcABwAHAAcABwADgAOAA4ADgAHAAcAAwADgBwADAAOAA4ABwAHAAcABwADgAOAA4ADgAOAAwAHAAcABwAHAA4ADgAMABwAAAAAAAAAf8H/+f/7//v/+//////////////////7//n/+f/4f8AAAAAAAAAA4ADgAeABwAHAA8ADgAOABwAHAAcADgAOAA4AHAAcADwAOAA4AHgAcABwAAAAAAAAAA8AH4AfgB/AP8A5wHngeeBw4PDw//D/+f/54HnAO8A8AAAAAAAD/4P/4//z//vg++D74Pvg++Hz/+P/w//z//vg/+B/4H/gf+D/////8//j/4AH8B/8P/x//PwN+AXwA+AD4APgA+AD4APgA+AD4APwAfgF/Ax//D/8H/wH4AAAAAP/8//7//vD/8D/wH/AP8A/wD/AP8A/wD/Af8D7w/P/4//D/4AAAAAB//H/8f/x//HwAfAB8AHwAfAB/+H/4f/h/+HwAfAB8AHwAfAB//n/+f/5//j/8P/w//D/8PgA+AD4APgA+AD/8P/w//D/8PgA+AD4APgA+AD4APgA+AD4AAAAAAAf+H/4//n4CfAD4APgA8ADw//D/8P/4D/gP/A9+Dz//H/8H/gAAAAAAAAAA8A/wD/AP8A/wD/AP8A////////////AP8A/wD/AP8A/wD/APAAAAAAfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgAHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeBD4H/gf8B/gH8AAAPg/+D74fPj4+Pj58Pvg+8D/wP+A/4D/wPvg+fD58Pj4+Pz4fvg++D8AAD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4APgA+AD/8P/w//D/8AAAAAAAAAAD4H/gf+D/8P/w3/Hfud+5n5ufn5+fH48fjx+OHAAAAAAAAAAAAAAAA+A/4D/wP/A/+D/8P/4/3j/PP8+/x7/D/8P/wf/A/8B/wH/APAAAAAAAAAAAAAB/4H/g//nw++B/wD/AP8A/wD/AP8A/4H3w+f/wf+B/4AAAAAAAA//z//v/////4H/gf+B/4H/gf+B/4P//8//z/8P/A+AD4APgA+AD4APgA+AAAAAAAB8Af8D/4fHx4PPAe8B7wHvAe8B7wHvg+eDw/+B/4D/wAPgAfAAAAAAAA/+D/+P/8//zwfPB88HzwfPD4//D/4P/g8+Dx8PD48HzwfPA+8D7wHwAAB/wf/D/8P/x+BHwAfAB8AH8AP+A/8A/8B/wA/gA+AD5APmA+f/5//H/4P+AAAP//////////A8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8AAAAAA+A/4D/gP+A/4D/gP+A/4D/gP+A/4D/gP+A/4D/gf+B//////f/4//AAAAAAAAPAP+A94DngePB48HDw8PDwePB44HngPcA9wD/AH4AfgA+ADwAAAAAAAAAAAAAAAAAAA4cfjx2PGY8Zz5nZuNmw2bDZ8PDwcOBw4AAAAAAAAAAAAAAAAAAB4H3wePD4+PB54H3gP8AfgB+AH4AfwD/AeeB58PDx8Pnge+B8AAAAAAAAAAPgffB58Hjw8PjweeB94D/AP8AfgB+ADwAPAA8ADwAPAA8ADwAAAAAAAAH//f/9//3/+AD4AfAD4AfAB8APgB8APwA+AHwA+AH4Af/////////8AAAAAAAAP/j//P/88PyAfAB8Afx//f///n/gf+B/4H/w//////3/fP58AAAAA+AD4APgA+AD4APgA+AD7+P/8//7+fvg++B/4H/gf+B/4Hvg+/v7//P/4+/AAAAf/D/8f/z//f+//Af4A/AD8APwA/AD8APwA/gD/AX//P/8f/w//B/4AAAAfAB8AHwAfAB8AHwAfH98f/z//fn98H/gf+B/4H/gf+B/8P35/f/8//x+fAAAAAAfgH/gf/D/+fB/4H/gf////////+AD4APgA/AZ//j/+H/4H8AAAAAAA+AH4A/gH6AeAB4AHgD/4P/g/+D/4B4AHgAeAB4AHgAeAB4AHgAeAB4AHgA/fH/8//3//fD/4H/gf+B/4H/gf+B9+f3//P/8f3wAfAB4APjn8P/g/8B/geAB4AHgAeAB4AHgAeAB5/nv+f/5+PnwefB54HngeeB54HngeeB54HngeeB4DwAfgB+AD4AGAAAAAAAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwADgAeAB4ABAAAAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgAeAB4AHgB+AHwAeAeAB4AHgAeAB4AHgAeAB4fnh8ePh58Hnwe+B/wH/Ae+B54HnwePh4/Hh8eH4DwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAAAAAAAAAAAAAAAAO++///zz+OH44fjh+OH44fjh+OHAAAAAAAAAAAAAAAAAAAAAAAA+f77/////3/8H/gf+B/4H/gf+B/4H/gf+B/4H/gf+B8AAAAAAAAAAAAAAAAH4B/4P/x//vwf+A/4D/gP+A/4D/gP+B9//j/8H/gH4AAAAAAAAPn4//z//P/++B74H/gf+B/4H/gf+D78fv/+//z/+Png+AD4APgA+AD4APgAD98//z//f/98P/gf+B/4H/gf+B/4H3w/f/8//z/fD58AHwAfAB8AHwAfAB8AHn5+fn5+/n/+f/5/wH+AfwB/AH4AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AAPwH/w//H/8f5z8APwA/gD/wH/wP/w//A/+Af4AfwA/wD/5/v/+//z/8B+AAMAHwAfAB8AHwD/8P/w//D/8B8AHwAfAB8AHwAfAB8AHwAfAB/wH/Af8A/wAAAAAAAD4H/gf+B/4H/gf+B/4H/gf+B/4H/gf+D/+/////99/nwAAAAAAAAAAAAAAAAAA+B98Hnw+fD48PD48HngeeB54H3AP8A/wD+AH4AAAAAAAAAAAAAAAAAAAAAAAAAAA4cdzx3Pmc+5zbjZsPmw+fD58HDgAAAAAAAAAAAAAAAAAAAAAAAAAAHwffj4+PB54H3gP8AfwB/AP+B/4Hnw+fnw+fD8AAAAAAAAAAPgP/B98Hnw+Pj4+PB48HngfeA94D3AP8AfwA+AD4APAB8AHwH+Af4B/AH4AAAAAAH//f/9//3//AH4A/AH4A/AD8A/gD8AfgB8AfwB//////////wAAAAAP/B/+H/4+fnw+eD54Hvge+B/4H/gf+B/4H/gf+B74Hvg+/D5//H/4f/A/8AB4APgD+B/4H/gf+Bz4APgA+AD4APgA+AD4APgA+AD4APgA+AD4APgA+AD4D/Af+D/8P/4wfgAeAB4APgA+AHwA/AH4B/AP4B+APwA+AHwAf/5//n/+f/4f4D/wP/g8/CB8AHwAfAB8AHwf+B/AH/gf/AB8ADwAPgA+QHx//H/4f/A/4AB8APwA/AD8AfwD/Af8B/wPfB58Hnw8fHh8+Hz///////8AfAB8AHwAfAB8P/w//D/8P/w8ADwAPAA8AD/wP/A//D/8AD4APgA+AD4APkB+f/x/+H/wP+AB/AP8D/wf3B8APgB8AHwAefB7/H/+fj58HnwefB58HnwePD4//h/8D/gH4P/////////+AD4AfAB8AHgA+AHwAfAB4APgA+AHwAfAB4APgA+AD4AfgB+AB+Af+D/8Pnx8PnwefB48PD58H/gH4B/4P/x4Pvge+B/4H3w+fn4//B/4B+AH4A/wH/h+fHw+fD54HngefD58Pn5+P/4f3g/eAB4APgA+IHw/+D/wP+AfgAAAAAAAAAAAAAAAAAAAAAD///////////////8AAAAAAAAAAAAAAAAAAAAAAOABwAHAA4AHAAcADwAPAA8ADwAPAA8ADwAPAA8ADwAHAAcAA4ADwAHAAOAHAAeAA4ABwADgAOAA4ADwAPAA8ADwAPAA8ADwAPAA4ADgAOABwAOAB4AHAAAAAAAAAAAAB/gf/H/+//////////////////9//z/+H/wH4AAAAAAAAAAAABwAPAA4AHgAeADwAPAA4AHgAcADwAPAA4AHgAeADwAPAA4AHgAcADwAPAA=";
    var cached;

    function inkBox(bits, w, h) {
        var minX = w;
        var minY = h;
        var maxX = -1;
        var maxY = -1;
        var y;
        var x;
        for (y = 0; y < h; y += 1) {
            for (x = 0; x < w; x += 1) {
                if (!bits[(y * w) + x]) {
                    continue;
                }
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) {
            return null;
        }
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    function normalize(bits, w, h) {
        var box = inkBox(bits, w, h);
        var out = new Uint8Array(CW * CH);
        var bw;
        var bh;
        var scale;
        var ox;
        var oy;
        var y;
        var x;
        var sx;
        var sy;
        var ix;
        var iy;
        if (!box) {
            return out;
        }
        bw = box.maxX - box.minX + 1;
        bh = box.maxY - box.minY + 1;
        scale = Math.min(CW / bw, CH / bh);
        ox = (CW - (bw * scale)) / 2;
        oy = (CH - (bh * scale)) / 2;
        for (y = 0; y < CH; y += 1) {
            sy = ((y + 0.5 - oy) / scale) + box.minY;
            for (x = 0; x < CW; x += 1) {
                sx = ((x + 0.5 - ox) / scale) + box.minX;
                ix = Math.floor(sx);
                iy = Math.floor(sy);
                if (ix < 0 || iy < 0 || ix >= w || iy >= h) {
                    continue;
                }
                if (bits[(iy * w) + ix]) {
                    out[(y * CW) + x] = 1;
                }
            }
        }
        return out;
    }

    function countHoles(grid) {
        var seen = new Uint8Array(grid.length);
        var stack = [];
        function push(x, y) {
            var i;
            if (x < 0 || y < 0 || x >= CW || y >= CH) {
                return;
            }
            i = (y * CW) + x;
            if (seen[i] || grid[i]) {
                return;
            }
            seen[i] = 1;
            stack.push(i);
        }
        var x;
        var y;
        var holes = 0;
        var i;
        for (x = 0; x < CW; x += 1) {
            push(x, 0);
            push(x, CH - 1);
        }
        for (y = 0; y < CH; y += 1) {
            push(0, y);
            push(CW - 1, y);
        }
        while (stack.length) {
            i = stack.pop();
            x = i % CW;
            y = (i / CW) | 0;
            push(x + 1, y);
            push(x - 1, y);
            push(x, y + 1);
            push(x, y - 1);
        }
        for (i = 0; i < grid.length; i += 1) {
            if (grid[i] || seen[i]) {
                continue;
            }
            holes += 1;
            stack.push(i);
            seen[i] = 1;
            while (stack.length) {
                var j = stack.pop();
                x = j % CW;
                y = (j / CW) | 0;
                push(x + 1, y);
                push(x - 1, y);
                push(x, y + 1);
                push(x, y - 1);
            }
        }
        return holes;
    }

    function shapeOf(grid) {
        var mirror = 0;
        var either = 0;
        var top = 0;
        var mid = 0;
        var left = 0;
        var right = 0;
        var y;
        var x;
        var row;
        var v;
        var m;
        for (y = 0; y < CH; y += 1) {
            row = 0;
            for (x = 0; x < CW; x += 1) {
                v = grid[(y * CW) + x];
                m = grid[(y * CW) + (CW - 1 - x)];
                if (v || m) {
                    either += 1;
                    if (v && m) mirror += 1;
                }
                row += v;
                if (x < CW * 0.28) left += v;
                if (x > CW * 0.72) right += v;
            }
            if (y < CH * 0.22) top = Math.max(top, row);
            if (y > CH * 0.35 && y < CH * 0.7) mid = Math.max(mid, row);
        }
        return {
            holes: countHoles(grid),
            symmetry: either ? mirror / either : 0,
            top: mid ? top / mid : 0,
            left: left,
            right: right
        };
    }

    function dice(a, b) {
        var inter = 0;
        var left = 0;
        var right = 0;
        var i;
        for (i = 0; i < a.length; i += 1) {
            left += a[i];
            right += b[i];
            if (a[i] && b[i]) inter += 1;
        }
        if (!left || !right) {
            return 0;
        }
        return (2 * inter) / (left + right);
    }

    function unpackTemplates() {
        var chars = TEMPLATE_CHARS;
        var raw;
        var list = [];
        var n;
        var grid;
        var i;
        var byte;
        if (!chars || !TEMPLATE_BITS) {
            return list;
        }
        raw = atob(TEMPLATE_BITS);
        for (n = 0; n < chars.length; n += 1) {
            grid = new Uint8Array(CW * CH);
            for (i = 0; i < CW * CH; i += 1) {
                byte = raw.charCodeAt((n * 44) + (i >> 3));
                grid[i] = (byte >> (7 - (i & 7))) & 1;
            }
            list.push({ ch: chars.charAt(n), grid: grid, shape: shapeOf(grid) });
        }
        return list;
    }

    function templates() {
        if (!cached) {
            cached = unpackTemplates();
        }
        return cached;
    }

    function gateOk(shape, tpl) {
        if (shape.holes !== tpl.shape.holes) {
            return false;
        }
        if (shape.top >= 2.4 && tpl.shape.top < 1.8) {
            return false;
        }
        if (shape.top < 1.45 && tpl.shape.top >= 3) {
            return false;
        }
        if (shape.symmetry >= 0.78 && tpl.shape.symmetry < 0.74) {
            return false;
        }
        return true;
    }

    function recognize(grid) {
        var shape = shapeOf(grid);
        var list = templates();
        var bestCh = '';
        var bestScore = 0;
        var i;
        var tpl;
        var score;
        for (i = 0; i < list.length; i += 1) {
            tpl = list[i];
            if (!gateOk(shape, tpl)) {
                continue;
            }
            score = dice(grid, tpl.grid);
            if (score > bestScore) {
                bestScore = score;
                bestCh = tpl.ch;
            }
        }
        return { ch: bestCh, score: bestScore };
    }

    function channelsFor(kind, length, w, h) {
        if (length === w * h) {
            return 1;
        }
        if (kind === 3 || length === w * h * 4) {
            return 4;
        }
        if (length === w * h * 3) {
            return 3;
        }
        return 0;
    }

    function luminance(src, channels, p) {
        var i = p * channels;
        if (channels === 1) {
            return src[i];
        }
        if (channels === 4 && src[i + 3] < 16) {
            return 255;
        }
        return (src[i] + src[i + 1] + src[i + 2]) / 3;
    }

    function clusters(indexes) {
        var out = [];
        var start;
        var prev;
        var i;
        if (!indexes.length) {
            return out;
        }
        start = indexes[0];
        prev = indexes[0];
        for (i = 1; i < indexes.length; i += 1) {
            if (indexes[i] - prev <= 2) {
                prev = indexes[i];
                continue;
            }
            out.push([start, prev]);
            start = indexes[i];
            prev = indexes[i];
        }
        out.push([start, prev]);
        return out;
    }

    function isRule(light, hard, span) {
        if (hard > span * 0.72) {
            return true;
        }
        return light > span * 0.62 && hard < span * 0.22;
    }

    function readBands(src, w, h, channels) {
        var lum = new Float32Array(w * h);
        var rowLight = new Uint16Array(h);
        var rowHard = new Uint16Array(h);
        var colLight = new Uint16Array(w);
        var colHard = new Uint16Array(w);
        var y;
        var x;
        var v;
        var sepRow = [];
        var sepCol = [];
        var rows;
        var cols;
        var dark = new Uint8Array(w * h);
        var rule = new Uint8Array(w * h);
        var i;
        for (y = 0; y < h; y += 1) {
            for (x = 0; x < w; x += 1) {
                v = luminance(src, channels, (y * w) + x);
                lum[(y * w) + x] = v;
                if (v < 168) {
                    rowHard[y] += 1;
                    colHard[x] += 1;
                }
                if (v < 215) {
                    rowLight[y] += 1;
                    colLight[x] += 1;
                }
            }
        }
        for (y = 0; y < h; y += 1) {
            if (isRule(rowLight[y], rowHard[y], w)) sepRow.push(y);
        }
        for (x = 0; x < w; x += 1) {
            if (isRule(colLight[x], colHard[x], h)) sepCol.push(x);
        }
        rows = clusters(sepRow);
        cols = clusters(sepCol);
        rows.forEach(function (span) {
            var a = span[0];
            var b = span[1];
            var yy;
            var xx;
            for (yy = Math.max(0, a - 1); yy <= Math.min(h - 1, b + 1); yy += 1) {
                for (xx = 0; xx < w; xx += 1) {
                    if (yy < a || yy > b) {
                        if (lum[(yy * w) + xx] > 140) rule[(yy * w) + xx] = 1;
                    } else {
                        rule[(yy * w) + xx] = 1;
                    }
                }
            }
        });
        cols.forEach(function (span) {
            var a = span[0];
            var b = span[1];
            var xx;
            var yy;
            for (xx = Math.max(0, a - 1); xx <= Math.min(w - 1, b + 1); xx += 1) {
                for (yy = 0; yy < h; yy += 1) {
                    if (xx < a || xx > b) {
                        if (lum[(yy * w) + xx] > 140) rule[(yy * w) + xx] = 1;
                    } else {
                        rule[(yy * w) + xx] = 1;
                    }
                }
            }
        });
        for (i = 0; i < lum.length; i += 1) {
            if (!rule[i] && lum[i] < 168) dark[i] = 1;
        }
        return { dark: dark, rows: rows, cols: cols };
    }

    function glyphRuns(dark, w, y0, y1, x0, x1) {
        var cols = [];
        var x;
        var y;
        var n;
        var runs = [];
        var start = -1;
        var i;
        var end;
        var hist = [];
        var letterHeight = 0;
        var tall = (y1 - y0) * 0.8;
        var spans = [];
        var limit;
        var guard;
        var pick;
        var widest;
        var a;
        var b;
        var ink;
        var leftInk;
        var rightInk;
        var bestX;
        var bestInk;
        var mid;
        var bits;
        var hit;
        for (x = x0; x < x1; x += 1) {
            n = 0;
            for (y = y0; y < y1; y += 1) n += dark[(y * w) + x];
            cols.push(n);
        }
        for (i = 0; i < cols.length; i += 1) {
            if (cols[i] > 3 && cols[i] < tall) {
                hist[cols[i]] = (hist[cols[i]] || 0) + 1;
                if (hist[cols[i]] >= 4 && cols[i] > letterHeight) letterHeight = cols[i];
            }
            if (cols[i] > 0 && start < 0) start = i;
            if ((cols[i] === 0 || i === cols.length - 1) && start >= 0) {
                end = cols[i] === 0 ? i : i + 1;
                if (end - start >= 2) spans.push([start, end]);
                start = -1;
            }
        }
        if (!letterHeight) {
            for (i = 0; i < cols.length; i += 1) {
                if (cols[i] > letterHeight && cols[i] < tall) letterHeight = cols[i];
            }
        }
        limit = Math.max(8, letterHeight + 1);
        guard = 0;
        while (guard < 24) {
            guard += 1;
            pick = -1;
            widest = limit;
            for (i = 0; i < spans.length; i += 1) {
                if (spans[i].frozen) continue;
                if (spans[i][1] - spans[i][0] > widest) {
                    widest = spans[i][1] - spans[i][0];
                    pick = i;
                }
            }
            if (pick < 0) break;
            a = spans[pick][0];
            b = spans[pick][1];
            bits = crop(dark, w, x0 + a, x0 + b, y0, y1);
            hit = recognize(normalize(bits, b - a, y1 - y0));
            if (hit.score >= MIN_GLYPH) {
                spans[pick].frozen = true;
                continue;
            }
            bestX = -1;
            bestInk = 99;
            for (x = a + 2; x < b - 2; x += 1) {
                ink = cols[x];
                leftInk = cols[x - 1];
                rightInk = cols[x + 1];
                if (ink > 2 || ink > leftInk || ink > rightInk) continue;
                mid = Math.abs(x - ((a + b) / 2));
                if (bestX < 0 || ink < bestInk || (ink === bestInk && mid < Math.abs(bestX - ((a + b) / 2)))) {
                    bestInk = ink;
                    bestX = x;
                }
            }
            if (bestX < 0) {
                spans[pick].frozen = true;
                continue;
            }
            spans.splice(pick, 1, [a, bestX], [bestX + 1, b]);
        }
        spans.forEach(function (piece) {
            runs.push([x0 + piece[0], x0 + piece[1]]);
        });
        return runs;
    }

    function crop(dark, w, x0, x1, y0, y1) {
        var cw = x1 - x0;
        var ch = y1 - y0;
        var bits = new Uint8Array(cw * ch);
        var y;
        var x;
        for (y = 0; y < ch; y += 1) {
            for (x = 0; x < cw; x += 1) {
                bits[(y * cw) + x] = dark[((y0 + y) * w) + (x0 + x)];
            }
        }
        return bits;
    }

    function readImageWords(src, width, height, kind) {
        var channels;
        var bands;
        var bounds;
        var words = [];
        var i;
        if (!src || width < 48 || height < 48 || width > 1200 || height > 1200) {
            return words;
        }
        channels = channelsFor(kind, src.length, width, height);
        if (!channels || src.length < width * height * channels) {
            return words;
        }
        bands = readBands(src, width, height, channels);
        if (bands.rows.length < 3 || bands.cols.length < 2) {
            return words;
        }
        bounds = [0];
        bands.rows.forEach(function (row) {
            bounds.push(Math.round((row[0] + row[1]) / 2));
        });
        bounds.push(height);
        for (i = 0; i < bounds.length - 1; i += 1) {
            var y0 = bounds[i] + 1;
            var y1 = bounds[i + 1] - 1;
            var runs;
            var widths;
            var median;
            var gapLimit;
            var current;
            var prevEnd;
            function flush() {
                var text;
                var total;
                var minScore;
                var g;
                var minX;
                var maxX;
                if (current.length < 2 && !(current.length === 1 && /[0-9]/.test(current[0].ch))) {
                    current = [];
                    return;
                }
                text = current.map(function (glyph) { return glyph.ch; }).join('');
                total = 0;
                minScore = 1;
                current.forEach(function (glyph) {
                    total += glyph.score;
                    if (glyph.score < minScore) minScore = glyph.score;
                });
                if (minScore >= MIN_GLYPH && (total / current.length) >= MIN_WORD && /[A-Za-z0-9]/.test(text)) {
                    minX = current[0].x0;
                    maxX = current[current.length - 1].x1;
                    words.push({
                        t: text,
                        x: minX / width,
                        y: y0 / height,
                        w: Math.max(0.001, (maxX - minX) / width),
                        h: Math.max(0.001, (y1 - y0) / height)
                    });
                }
                current = [];
            }
            if (y1 - y0 < 6) {
                continue;
            }
            runs = glyphRuns(bands.dark, width, y0, y1, 0, width);
            if (!runs.length) {
                continue;
            }
            widths = runs.map(function (run) { return run[1] - run[0]; }).sort(function (a, b) { return a - b; });
            median = widths[Math.floor(widths.length / 2)] || 8;
            gapLimit = Math.max(3, median * 0.45);
            current = [];
            prevEnd = null;
            runs.forEach(function (run) {
                var gap = prevEnd == null ? 0 : run[0] - prevEnd;
                var bits;
                var grid;
                var hit;
                if (prevEnd != null && gap > gapLimit) {
                    flush();
                }
                bits = crop(bands.dark, width, run[0], run[1], y0, y1);
                grid = normalize(bits, run[1] - run[0], y1 - y0);
                hit = recognize(grid);
                if (!hit.ch || hit.score < MIN_GLYPH) {
                    flush();
                    prevEnd = run[1];
                    return;
                }
                current.push({ ch: hit.ch, score: hit.score, x0: run[0], x1: run[1] });
                prevEnd = run[1];
            });
            flush();
        }
        return words;
    }

    function multiply(m, n) {
        return [
            (m[0] * n[0]) + (m[2] * n[1]),
            (m[1] * n[0]) + (m[3] * n[1]),
            (m[0] * n[2]) + (m[2] * n[3]),
            (m[1] * n[2]) + (m[3] * n[3]),
            (m[0] * n[4]) + (m[2] * n[5]) + m[4],
            (m[1] * n[4]) + (m[3] * n[5]) + m[5]
        ];
    }

    function collectImagePaints(fnArray, argsArray, OPS) {
        var ctm = [1, 0, 0, 1, 0, 0];
        var stack = [];
        var paints = [];
        var i;
        var fn;
        var args;
        for (i = 0; i < fnArray.length; i += 1) {
            fn = fnArray[i];
            args = argsArray[i];
            if (fn === OPS.save) {
                stack.push(ctm.slice());
            } else if (fn === OPS.restore) {
                ctm = stack.length ? stack.pop() : [1, 0, 0, 1, 0, 0];
            } else if (fn === OPS.transform && args && args.length >= 6) {
                ctm = multiply(ctm, args);
            } else if (fn === OPS.paintImageXObject && args && args[0]) {
                paints.push({ name: args[0], ctm: ctm.slice() });
            }
        }
        return paints;
    }

    function mapImageBox(box, ctm, pageWidth, pageHeight) {
        var corners = [
            [box.x, box.y],
            [box.x + box.w, box.y],
            [box.x, box.y + box.h],
            [box.x + box.w, box.y + box.h]
        ];
        var minX = Infinity;
        var maxX = -Infinity;
        var minY = Infinity;
        var maxY = -Infinity;
        var i;
        var u;
        var v;
        var px;
        var py;
        for (i = 0; i < corners.length; i += 1) {
            u = corners[i][0];
            v = 1 - corners[i][1];
            px = (ctm[0] * u) + (ctm[2] * v) + ctm[4];
            py = (ctm[1] * u) + (ctm[3] * v) + ctm[5];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
        }
        return {
            t: box.t,
            x: minX / pageWidth,
            y: (pageHeight - maxY) / pageHeight,
            w: Math.max(0.001, (maxX - minX) / pageWidth),
            h: Math.max(0.001, (maxY - minY) / pageHeight)
        };
    }

    return {
        normalize: normalize,
        readImageWords: readImageWords,
        collectImagePaints: collectImagePaints,
        mapImageBox: mapImageBox
    };
}));
