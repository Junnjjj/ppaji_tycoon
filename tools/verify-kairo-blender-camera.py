#!/usr/bin/env python3
"""Verify the exact Ppaji Kairo camera and d0-d3 root-direction contract in Blender.

Run with Blender, not ordinary Python:

    blender --background --factory-startup \
      --python tools/verify-kairo-blender-camera.py

An optional contract path may follow ``--``.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTRACT = ROOT / "src/assets/kairo-render-contract.json"
TOLERANCE = 1e-5


def arguments() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def near(actual: float, expected: float, tolerance: float = TOLERANCE) -> None:
    if abs(actual - expected) > tolerance:
        raise RuntimeError(f"Expected {expected}, got {actual} (tolerance {tolerance})")


def near_vector(actual: Vector, expected: list[float]) -> None:
    for value, target in zip(actual, expected):
        near(float(value), float(target))


def screen_point(scene: bpy.types.Scene, camera: bpy.types.Object, point: Vector) -> Vector:
    projected = world_to_camera_view(scene, camera, point)
    return Vector((
        projected.x * scene.render.resolution_x,
        (1.0 - projected.y) * scene.render.resolution_y,
    ))


def rounded(values) -> list[float]:
    return [round(float(value), 9) for value in values]


def main() -> None:
    args = arguments()
    contract_path = Path(args[0]).resolve() if args else DEFAULT_CONTRACT
    contract = json.loads(contract_path.read_text(encoding="utf-8"))
    projection = contract["projection"]
    blender = projection["blender"]

    if projection["type"] != "orthographic":
        raise RuntimeError("Projection must be orthographic")
    if blender["axisMap"] != {"gameI": "+X", "gameJ": "-Y", "height": "+Z"}:
        raise RuntimeError("Blender axis map changed")
    if blender["rotationMode"] != "XYZ":
        raise RuntimeError("Blender camera rotation mode changed")

    scene = bpy.context.scene
    scene.render.resolution_x = 32
    scene.render.resolution_y = 16
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = 1.0
    scene.render.pixel_aspect_y = 1.0

    camera_data = bpy.data.cameras.new("PPAJI_KAIRO_CAMERA_CONTRACT")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = float(scene.render.resolution_x)
    camera = bpy.data.objects.new("PPAJI_KAIRO_CAMERA_CONTRACT", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera

    target = Vector((0.0, 0.0, 0.0))
    radius = 10.0
    position_unit = Vector(blender["cameraPositionUnitXYZ"])
    camera.location = target + position_unit * radius
    camera.rotation_mode = blender["rotationMode"]
    camera.rotation_euler = tuple(math.radians(value) for value in blender["rotationEulerDeg"])
    bpy.context.view_layer.update()

    rotation = camera.matrix_world.to_quaternion()
    right = rotation @ Vector((1.0, 0.0, 0.0))
    up = rotation @ Vector((0.0, 1.0, 0.0))
    back = rotation @ Vector((0.0, 0.0, 1.0))
    forward = -back
    near_vector(right, blender["cameraRightUnitXYZ"])
    near_vector(up, blender["cameraUpUnitXYZ"])
    near_vector(forward, blender["cameraForwardUnitXYZ"])
    near_vector(back, position_unit)

    quaternion = rotation
    near_vector(
        Vector((quaternion.w, quaternion.x, quaternion.y, quaternion.z)),
        blender["rotationQuaternionWXYZ"],
    )

    origin = screen_point(scene, camera, target)
    tile = float(projection["tileWorld"])
    delta_i = screen_point(scene, camera, Vector((tile, 0.0, 0.0))) - origin
    delta_j = screen_point(scene, camera, Vector((0.0, -tile, 0.0))) - origin
    delta_h = screen_point(
        scene,
        camera,
        Vector((0.0, 0.0, float(projection["quadHeightScale"]))),
    ) - origin
    step_x, step_y = projection["stepScreenTexels"]
    near(delta_i.x, float(step_x))
    near(delta_i.y, float(step_y))
    near(delta_j.x, -float(step_x))
    near(delta_j.y, float(step_y))
    near(delta_h.x, 0.0)
    near(delta_h.y, -1.0)

    marker = Vector((0.0, -1.0, 0.0))  # canonical game +J under J = Blender -Y
    marker_quadrants: list[str] = []
    for direction in projection["facilityDirections"]:
        yaw_deg = float(direction["rootEulerXYZDeg"][2])
        rotated = Matrix.Rotation(math.radians(yaw_deg), 4, "Z") @ marker
        screen = Vector((rotated.dot(right), -rotated.dot(up)))
        quadrant = (
            ("lower" if screen.y > 0 else "upper")
            + "-"
            + ("right" if screen.x > 0 else "left")
        )
        if quadrant != direction["canonicalPlusJMarkerScreen"]:
            raise RuntimeError(
                f"{direction['id']} marker expected {direction['canonicalPlusJMarkerScreen']}, got {quadrant}"
            )
        marker_quadrants.append(quadrant)

    report = {
        "status": "PASS",
        "contract": str(contract_path),
        "projection": projection["type"],
        "view_yaw_game_deg": projection["yaw_deg"],
        "pitch_down_deg": projection["pitch_down_deg"],
        "roll_deg": projection["roll_deg"],
        "blender_rotation_mode": camera.rotation_mode,
        "blender_euler_xyz_deg": rounded(math.degrees(value) for value in camera.rotation_euler),
        "camera_position_unit_xyz": rounded(position_unit),
        "camera_forward_unit_xyz": rounded(forward),
        "camera_right_unit_xyz": rounded(right),
        "camera_up_unit_xyz": rounded(up),
        "projected_game_i_texels": rounded(delta_i),
        "projected_game_j_texels": rounded(delta_j),
        "projected_logical_height_texel": rounded(delta_h),
        "direction_marker_quadrants": marker_quadrants,
    }
    print("PPAJI_KAIRO_CAMERA_VERIFICATION=" + json.dumps(report, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
