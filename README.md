#  Space Curve Visualizer
*A Differential Geometry Playground for 3D Parametric Curves*

This project is an interactive, browser-based visualizer that brings the **Frenet–Serret basis** to life.  
Given any smooth parametric curve

\[
\mathbf{r}(t) = (x(t), y(t), z(t)),
\]

the app numerically computes and animates:

- The moving **Frenet–Serret frame**
  - Tangent: \(\mathbf{T}(t)\)
  - Normal: \(\mathbf{N}(t)\)
  - Binormal: \(\mathbf{B}(t)\)
- The curvature: \(\kappa(t)\)
- The torsion: \(\tau(t)\)
- The **3D curve** itself, rendered as a smooth polyline

This tool enables an intuitive understanding of how curves twist, bend, and move in space — with precise computations and real-time 3D visualization.

---

##  Features

###  Dynamic 3D Visualization
- Render arbitrary 3D parametric curves  
- Animate a point moving along the curve  
- Display the Frenet frame vectors \(\mathbf{T}, \mathbf{N}, \mathbf{B}\) in real time  
- Show the instantaneous osculating circle and curvature radius  

###  Mathematical Analysis
- Numerical computation of derivatives \(\mathbf{r}'(t), \mathbf{r}''(t), \mathbf{r}'''(t)\)  
- High-fidelity curvature & torsion plots  
- Optional arc-length reparametrization  
- Handles general curves, including helices, knots, and custom expressions  

###  Built With
- **ECMAScript 2025**  
- **Three.js** (via `@react-three/fiber` and `@react-three/drei`)  
- Simple, fast **finite difference** methods for numerical differentiation    