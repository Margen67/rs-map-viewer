/* Spatial broad phase for streamed static meshes. Exact native triangle tests remain unchanged. */
#include <stdlib.h>
#include <string.h>
#include <math.h>
#define VIEWER_GRID_SIDE 512
#define VIEWER_GRID_CELLS (VIEWER_GRID_SIDE * VIEWER_GRID_SIDE)
#define VIEWER_GRID_SIZE 128.0f
#define VIEWER_GRID_ORIGIN 32768.0f
#define VIEWER_MAX_REFERENCES (8u * 1024u * 1024u)
static uint32_t *viewer_offsets, *viewer_references, *viewer_wall_candidates;
static uint16_t *viewer_min_x, *viewer_min_z;
static int viewer_index_built;

void rs64_collision_index_reset(void) {
    free(viewer_offsets); free(viewer_references); free(viewer_wall_candidates);
    free(viewer_min_x); free(viewer_min_z);
    viewer_offsets = viewer_references = viewer_wall_candidates = NULL;
    viewer_min_x = viewer_min_z = NULL;
    viewer_index_built = 0;
}
static int viewer_cell(float value) { return (int)floorf((value + VIEWER_GRID_ORIGIN) / VIEWER_GRID_SIZE); }
static int viewer_clamp_cell(int value) { return value < 0 ? 0 : value >= VIEWER_GRID_SIDE ? VIEWER_GRID_SIDE - 1 : value; }
static void viewer_bounds(struct SM64SurfaceCollisionData *s, int *x0, int *x1, int *z0, int *z1) {
    *x0 = viewer_clamp_cell(viewer_cell(fminf(s->vertex1[0], fminf(s->vertex2[0], s->vertex3[0]))));
    *x1 = viewer_clamp_cell(viewer_cell(fmaxf(s->vertex1[0], fmaxf(s->vertex2[0], s->vertex3[0]))));
    *z0 = viewer_clamp_cell(viewer_cell(fminf(s->vertex1[2], fminf(s->vertex2[2], s->vertex3[2]))));
    *z1 = viewer_clamp_cell(viewer_cell(fmaxf(s->vertex1[2], fmaxf(s->vertex2[2], s->vertex3[2]))));
}
static void viewer_build_index(void) {
    viewer_index_built = 1;
    uint32_t count = loaded_surface_iter_group_size(0);
    if (!count) return;
    uint32_t *cursor = NULL;
    viewer_offsets = calloc(VIEWER_GRID_CELLS + 1, sizeof(uint32_t));
    viewer_min_x = malloc(count * sizeof(uint16_t));
    viewer_min_z = malloc(count * sizeof(uint16_t));
    viewer_wall_candidates = malloc(count * sizeof(uint32_t));
    if (!viewer_offsets || !viewer_min_x || !viewer_min_z || !viewer_wall_candidates) goto failed;
    uint64_t total = 0;
    for (uint32_t i = 0; i < count; i++) {
        struct SM64SurfaceCollisionData *s = loaded_surface_iter_get_at_index(0, i);
        int x0,x1,z0,z1; viewer_bounds(s,&x0,&x1,&z0,&z1);
        viewer_min_x[i]=x0; viewer_min_z[i]=z0;
        if (!s->isValid) continue;
        total += (uint32_t)(x1-x0+1) * (uint32_t)(z1-z0+1);
        if (total > VIEWER_MAX_REFERENCES) goto failed;
        for (int z=z0;z<=z1;z++) for (int x=x0;x<=x1;x++) viewer_offsets[z*VIEWER_GRID_SIDE+x+1]++;
    }
    for (uint32_t i=1;i<=VIEWER_GRID_CELLS;i++) viewer_offsets[i]+=viewer_offsets[i-1];
    viewer_references=malloc((total ? total : 1)*sizeof(uint32_t));
    cursor=malloc(VIEWER_GRID_CELLS*sizeof(uint32_t));
    if (!viewer_references || !cursor) goto failed;
    memcpy(cursor,viewer_offsets,VIEWER_GRID_CELLS*sizeof(uint32_t));
    for (uint32_t i=0;i<count;i++) {
        struct SM64SurfaceCollisionData *s=loaded_surface_iter_get_at_index(0,i);
        if (!s->isValid) continue;
        int x0,x1,z0,z1; viewer_bounds(s,&x0,&x1,&z0,&z1);
        for(int z=z0;z<=z1;z++) for(int x=x0;x<=x1;x++) viewer_references[cursor[z*VIEWER_GRID_SIDE+x]++]=i;
    }
    free(cursor); return;
failed:
    free(cursor); rs64_collision_index_reset(); viewer_index_built=1;
}
struct ViewerSurfaceQuery {
    uint32_t next,end,group,index,sorted_count;
    int fallback,x0,x1,z0,z1,x,z;
    uint32_t *sorted;
    struct SM64WallCollisionData *watch;
    float anchor_x,anchor_z,radius;
    uint32_t minimum_index;
};
static int viewer_compare_indices(const void *a,const void *b) {
    uint32_t x=*(const uint32_t*)a,y=*(const uint32_t*)b;
    return (x>y)-(x<y);
}
static struct ViewerSurfaceQuery viewer_surface_query(float x,float z,float radius,struct SM64WallCollisionData *watch) {
    struct ViewerSurfaceQuery q={0};
    q.watch=watch;q.anchor_x=x;q.anchor_z=z;q.radius=radius;
    float reach=watch ? radius*2 : radius;
    q.x0=viewer_cell(x-reach);q.x1=viewer_cell(x+reach);
    q.z0=viewer_cell(z-reach);q.z1=viewer_cell(z+reach);
    if (q.x0<0 || q.z0<0 || q.x1>=VIEWER_GRID_SIDE || q.z1>=VIEWER_GRID_SIDE || loaded_surface_iter_group_count()!=1) {q.fallback=1;return q;}
    if (!viewer_index_built) viewer_build_index();
    if (!viewer_offsets) {q.fallback=1;return q;}
    if (radius>0) {
        /* Canonical bucket ownership avoids duplicates; sorting preserves native contact order.
           Nested floor queries use the point-query path and cannot overwrite this wall scratch. */
        for(int zz=q.z0;zz<=q.z1;zz++) for(int xx=q.x0;xx<=q.x1;xx++) {
            uint32_t cell=zz*VIEWER_GRID_SIDE+xx;
            for(uint32_t j=viewer_offsets[cell];j<viewer_offsets[cell+1];j++) {
                uint32_t i=viewer_references[j];
                int ownerX=viewer_min_x[i]>q.x0 ? viewer_min_x[i] : q.x0;
                int ownerZ=viewer_min_z[i]>q.z0 ? viewer_min_z[i] : q.z0;
                if(xx==ownerX && zz==ownerZ) viewer_wall_candidates[q.sorted_count++]=i;
            }
        }
        qsort(viewer_wall_candidates,q.sorted_count,sizeof(uint32_t),viewer_compare_indices);
        q.sorted=viewer_wall_candidates;
    } else {
        uint32_t cell=q.z0*VIEWER_GRID_SIDE+q.x0;
        q.next=viewer_offsets[cell];q.end=viewer_offsets[cell+1];
    }
    return q;
}
static struct SM64SurfaceCollisionData *viewer_surface_next(struct ViewerSurfaceQuery *q) {
    if(q->fallback) {
        uint32_t groups=loaded_surface_iter_group_count();
        while(q->group<groups) {
            if(q->index<loaded_surface_iter_group_size(q->group)) return loaded_surface_iter_get_at_index(q->group,q->index++);
            q->group++;q->index=0;
        }
        return NULL;
    }
    if(q->watch && (fabsf(q->watch->x-q->anchor_x)>q->radius || fabsf(q->watch->z-q->anchor_z)>q->radius)) {
        uint32_t minimum=q->minimum_index;
        *q=viewer_surface_query(q->watch->x,q->watch->z,q->radius,q->watch);
        q->minimum_index=minimum;
        /* Earlier surfaces have already been visited in the native scan order. */
        if(q->fallback) q->index=minimum;
        else while(q->index<q->sorted_count && q->sorted[q->index]<minimum) q->index++;
        return viewer_surface_next(q);
    }
    if(q->sorted) {
        if(q->index>=q->sorted_count) return NULL;
        uint32_t index=q->sorted[q->index++];q->minimum_index=index+1;
        return loaded_surface_iter_get_at_index(0,index);
    }
    return q->next<q->end ? loaded_surface_iter_get_at_index(0,viewer_references[q->next++]) : NULL;
}
